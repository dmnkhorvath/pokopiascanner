/**
 * Grid-based Scanner Engine
 *
 * Supports 4 scan modes:
 *  - item/recipe: 12-col grid with icon fingerprint matching + D/U row-pattern scroll tracking
 *  - pokemon: 8-col grid with saturation/brightness classification + pixel cross-correlation scroll
 *  - habitat: 4-col grid with purple/scenic classification + pixel cross-correlation scroll
 *
 * Works entirely with canvas pixel operations — no ML dependencies.
 */

// ─── Lazy-loaded JSON assets (loaded on first scan to reduce initial bundle) ──
let _pokopiaDataset = null;
let _fingerprintData = null;

let FP_SIZE = 0;
let FP_SCALE = 1;
const MIN_MATCH_SCORE = 0.65;

let itemList = [];
let recipeList = [];
let pokemonList = [];
let habitatList = [];

let fpNames = [];
let fpVectors = null;

async function ensureGridData() {
  if (_pokopiaDataset) return;
  const [dsMod, fpMod] = await Promise.all([
    import('../assets/pokopiaDataset.json'),
    import('../assets/iconFingerprints.json'),
  ]);
  _pokopiaDataset = dsMod.default;
  _fingerprintData = fpMod.default;

  FP_SIZE = _fingerprintData.size;
  FP_SCALE = _fingerprintData.scale;

  itemList = _pokopiaDataset.items || [];
  recipeList = _pokopiaDataset.recipes || [];

  pokemonList = [...(_pokopiaDataset.pokemon || [])].sort((a, b) => {
    const na = parseInt(a.number?.replace('#', ''), 10) || 0;
    const nb = parseInt(b.number?.replace('#', ''), 10) || 0;
    return na - nb;
  });

  habitatList = [...(_pokopiaDataset.habitats || [])].sort((a, b) => {
    const na = parseInt(a.number, 10) || 0;
    const nb = parseInt(b.number, 10) || 0;
    return na - nb;
  });

  // Pre-process fingerprint database
  fpNames = Object.keys(_fingerprintData.fingerprints);
  fpVectors = new Float32Array(fpNames.length * FP_SIZE * FP_SIZE);
  const dim = FP_SIZE * FP_SIZE;
  for (let i = 0; i < fpNames.length; i++) {
    const quantized = _fingerprintData.fingerprints[fpNames[i]];
    const offset = i * dim;
    for (let j = 0; j < dim; j++) {
      fpVectors[offset + j] = quantized[j] / FP_SCALE;
    }
  }

  // Build item type lookup
  itemTypeMap = new Map();
  for (const entry of itemList) {
    itemTypeMap.set(entry.name, { type: 'item', category: entry.category || 'Unknown' });
  }
  for (const entry of recipeList) {
    itemTypeMap.set(entry.name, { type: 'recipe', category: entry.category || 'Unknown' });
  }
}

// Build a lookup from item name → type info (populated by ensureGridData)
let itemTypeMap = new Map();

// ─── Scaled grid parameters ─────────────────────────────────────────────────

export function detectGridParams(videoWidth, videoHeight) {
  if (!videoWidth || !videoHeight) throw new Error('Invalid video dimensions');
  const sx = videoWidth  / REF_WIDTH;
  const sy = videoHeight / REF_HEIGHT;
  return {
    // Item/recipe params
    cols:        ITEM_COLS,
    visibleRows: ITEM_VIS_ROWS,
    cell:        Math.round(ITEM_CELL   * sx),
    col0X:       Math.round(ITEM_COL0_X * sx),
    row0Y:       Math.round(ITEM_ROW0_Y * sy),
    tileHalf:    Math.round(ITEM_TILE_HALF * Math.min(sx, sy)),
    width:       videoWidth,
    height:      videoHeight,
    sx, sy,
  };
}

/**
 * Build scaled parameters for any scan mode.
 */
function getModeParams(videoWidth, videoHeight, scanMode) {
  const sx = videoWidth  / REF_WIDTH;
  const sy = videoHeight / REF_HEIGHT;

  if (scanMode === 'pokemon') {
    return {
      cols:        POKE_COLS,
      visibleRows: POKE_VIS_ROWS,
      tileXs:      POKE_TILE_XS.map(x => Math.round(x * sx)),
      row0Y:       Math.round(POKE_ROW0_Y * sy),
      rowSpacing:  Math.round(POKE_ROW_SPACE * sy),
      tileHalf:    Math.round(POKE_TILE_HALF * Math.min(sx, sy)),
      width:       videoWidth,
      height:      videoHeight,
      sx, sy,
      // Cross-correlation strip
      stripX:  Math.round(POKE_STRIP_X * sx),
      stripW:  Math.round(POKE_STRIP_W * sx),
      yStart:  Math.round(XCORR_Y_START * sy),
      yEnd:    Math.round(XCORR_Y_END * sy),
    };
  }

  if (scanMode === 'habitat') {
    return {
      cols:        HAB_COLS,
      visibleRows: HAB_VIS_ROWS,
      tileXs:      HAB_TILE_XS.map(x => Math.round(x * sx)),
      row0Y:       Math.round(HAB_ROW0_Y * sy),
      rowSpacing:  Math.round(HAB_ROW_SPACE * sy),
      tileHW:      Math.round(HAB_TILE_HW * sx),
      tileHH:      Math.round(HAB_TILE_HH * sy),
      width:       videoWidth,
      height:      videoHeight,
      sx, sy,
      // Cross-correlation strip
      stripX:  Math.round(HAB_STRIP_X * sx),
      stripW:  Math.round(HAB_STRIP_W * sx),
      yStart:  Math.round(XCORR_Y_START * sy),
      yEnd:    Math.round(XCORR_Y_END * sy),
    };
  }

  // item/recipe — use existing layout
  return {
    cols:        ITEM_COLS,
    visibleRows: ITEM_VIS_ROWS,
    cell:        Math.round(ITEM_CELL * sx),
    col0X:       Math.round(ITEM_COL0_X * sx),
    row0Y:       Math.round(ITEM_ROW0_Y * sy),
    tileHalf:    Math.round(ITEM_TILE_HALF * Math.min(sx, sy)),
    width:       videoWidth,
    height:      videoHeight,
    sx, sy,
  };
}

// ─── Pixel helpers ───────────────────────────────────────────────────────────

function meanSaturation(imageData, x, y, w, h) {
  const { data, width } = imageData;
  let totalSat = 0;
  let count    = 0;
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : ((max - min) / max) * 100;
      totalSat += sat;
      count++;
    }
  }
  return count > 0 ? totalSat / count : 0;
}

/**
 * Compute mean saturation (0-100) and mean brightness (0-255) for a region.
 */
function meanSatBright(imageData, x, y, w, h) {
  const { data, width } = imageData;
  let totalSat = 0, totalBright = 0, count = 0;
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      totalSat += max === 0 ? 0 : ((max - min) / max) * 100;
      totalBright += max;
      count++;
    }
  }
  return {
    sat:    count > 0 ? totalSat / count : 0,
    bright: count > 0 ? totalBright / count : 0,
  };
}

/**
 * RGB to HSV. Returns H in [0,360], S in [0,100], V in [0,255].
 */
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  return { h, s, v: max };
}

/**
 * Classify a habitat tile.
 * Returns 'B' (built), 'U' (unbuilt/purple), or 'E' (empty/transition).
 */
function classifyHabitatTile(imageData, cx, cy, hw, hh) {
  const { data, width } = imageData;
  const x0 = cx - hw;
  const y0 = cy - hh;
  const w = hw * 2;
  const h = hh * 2;

  let purpleCount = 0;
  let greenCount = 0;
  let blueCount = 0;
  let highSatCount = 0;
  let contentCount = 0;
  let totalPixels = 0;

  // Background color (242, 239, 243)
  const bgR = 242, bgG = 239, bgB = 243;

  for (let py = y0; py < y0 + h; py += 2) {
    for (let px = x0; px < x0 + w; px += 2) {
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) continue;
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      totalPixels++;

      // Content detection: RGB distance from background > 20
      const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
      if (dist > 20) contentCount++;

      const hsv = rgbToHsv(r, g, b);

      // Purple: H 230-330 (browser 0-360), S >= 15%, V >= 140
      if (hsv.h >= 230 && hsv.h <= 330 && hsv.s >= 15 && hsv.v >= 140) {
        purpleCount++;
      }

      // Green: H 60-170, S > 40%
      if (hsv.h >= 60 && hsv.h <= 170 && hsv.s > 40) {
        greenCount++;
      }

      // Blue: H 170-230, S > 30%
      if (hsv.h >= 170 && hsv.h <= 230 && hsv.s > 30) {
        blueCount++;
      }

      // High saturation
      if (hsv.s > 25) {
        highSatCount++;
      }
    }
  }

  if (totalPixels === 0) return 'E';

  const contentPct  = contentCount / totalPixels;
  const purplePct   = purpleCount / totalPixels;
  const scenicPct   = (greenCount + blueCount) / totalPixels;
  const highSatPct  = highSatCount / totalPixels;

  // Empty: too little content (transition frame)
  if (contentPct < 0.10) return 'E';

  // Unbuilt: purple blob
  if (purplePct > 0.20) return 'U';

  // Built: scenic or colorful
  if (scenicPct > 0.10 || highSatPct > 0.20 || (contentPct > 0.30 && highSatPct > 0.05)) {
    return 'B';
  }

  // Default: unbuilt (not enough color to be built)
  return 'U';
}

/**
 * Classify a Pokémon tile.
 * Returns 'C' (captured), 'U' (unknown/?), or 'S' (sensed/silhouette).
 */
function classifyPokemonTile(imageData, cx, cy, half) {
  const x = cx - half;
  const y = cy - half;
  const w = half * 2;
  const h = half * 2;
  const { sat, bright } = meanSatBright(imageData, x, y, w, h);

  if (sat > POKE_SAT_THRESH) return 'C';       // Colorful sprite → captured
  if (bright > 180)          return 'U';        // Grey '?' bright → unknown
  return 'S';                                   // Dark silhouette → sensed
}

// ─── Pixel cross-correlation scroll tracking ─────────────────────────────────

/**
 * Extract a 1D vertical brightness profile by averaging a horizontal strip.
 * Returns Float64Array of length (yEnd - yStart).
 */
function extractVerticalProfile(imageData, stripX, stripW, yStart, yEnd) {
  const { data, width } = imageData;
  const safeStripX = Math.max(0, stripX);
  const safeYEnd = Math.min(yEnd, imageData.height);
  const len = safeYEnd - yStart;
  if (len <= 0) return new Float64Array(0);
  const profile = new Float64Array(len);

  for (let py = yStart; py < safeYEnd; py++) {
    let sum = 0;
    let cnt = 0;
    for (let px = safeStripX; px < safeStripX + stripW && px < width; px++) {
      const idx = (py * width + px) * 4;
      // Grayscale
      sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      cnt++;
    }
    profile[py - yStart] = cnt > 0 ? sum / cnt : 0;
  }
  return profile;
}

/**
 * Normalize a profile: subtract mean, divide by std.
 */
function normalizeProfile(profile) {
  const n = profile.length;
  if (n === 0) return new Float64Array(0);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += profile[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = profile[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / n);

  const result = new Float64Array(n);
  if (std > 0.001) {
    for (let i = 0; i < n; i++) result[i] = (profile[i] - mean) / std;
  }
  return result;
}

/**
 * Measure vertical pixel shift between two frames using cross-correlation.
 * Positive shift = content moved up (scrolled down).
 * Returns { shift, correlation }.
 */
function measurePixelShift(prevProfile, currProfile, maxShift) {
  const n = prevProfile.length;
  let bestShift = 0;
  let bestCorr  = -Infinity;

  for (let shift = -10; shift <= maxShift; shift++) {
    let dot = 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      const j = i + shift;
      if (j >= 0 && j < n) {
        dot += prevProfile[j] * currProfile[i];
        cnt++;
      }
    }
    if (cnt > 0) {
      const corr = dot / cnt;
      if (corr > bestCorr) {
        bestCorr  = corr;
        bestShift = shift;
      }
    }
  }

  return { shift: bestShift, correlation: bestCorr };
}

// ─── Icon fingerprint extraction (item/recipe) ──────────────────────────────

function extractTileFingerprint(imageData, tx, ty, tw, th) {
  const { data, width } = imageData;
  const safeTw = Math.min(tw, width - tx);
  const safeTh = Math.min(th, Math.floor(data.length / 4 / width) - ty);
  if (safeTw <= 0 || safeTh <= 0) return null;

  let minX = tw, maxX = 0, minY = th, maxY = 0;
  let hasIcon = false;

  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const idx = ((ty + py) * width + (tx + px)) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const val = max / 255;
      if (sat < 0.10 && val > 0.70) continue;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      hasIcon = true;
    }
  }

  if (!hasIcon || maxX - minX < 3 || maxY - minY < 3) return null;

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const sq = Math.max(cw, ch);
  const ox = Math.floor((sq - cw) / 2);
  const oy = Math.floor((sq - ch) / 2);

  const squarePixels = new Uint8Array(sq * sq * 3);
  squarePixels.fill(255);

  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const srcIdx = ((ty + minY + py) * width + (tx + minX + px)) * 4;
      const dstIdx = ((oy + py) * sq + (ox + px)) * 3;
      squarePixels[dstIdx]     = data[srcIdx];
      squarePixels[dstIdx + 1] = data[srcIdx + 1];
      squarePixels[dstIdx + 2] = data[srcIdx + 2];
    }
  }

  const fp = new Float32Array(FP_SIZE * FP_SIZE);
  const blockW = sq / FP_SIZE;
  const blockH = sq / FP_SIZE;

  for (let fy = 0; fy < FP_SIZE; fy++) {
    for (let fx = 0; fx < FP_SIZE; fx++) {
      const srcY0 = Math.floor(fy * blockH);
      const srcY1 = Math.min(Math.floor((fy + 1) * blockH), sq);
      const srcX0 = Math.floor(fx * blockW);
      const srcX1 = Math.min(Math.floor((fx + 1) * blockW), sq);
      let sum = 0;
      let cnt = 0;
      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * sq + sx) * 3;
          sum += 0.299 * squarePixels[idx] + 0.587 * squarePixels[idx + 1] + 0.114 * squarePixels[idx + 2];
          cnt++;
        }
      }
      fp[fy * FP_SIZE + fx] = cnt > 0 ? sum / cnt : 255;
    }
  }

  let mean = 0;
  for (let i = 0; i < fp.length; i++) mean += fp[i];
  mean /= fp.length;
  for (let i = 0; i < fp.length; i++) fp[i] -= mean;

  let norm = 0;
  for (let i = 0; i < fp.length; i++) norm += fp[i] * fp[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < fp.length; i++) fp[i] /= norm;
  }

  return fp;
}

function matchFingerprint(tileFp) {
  if (!tileFp || fpNames.length === 0) return null;
  const dim = FP_SIZE * FP_SIZE;
  let bestIdx   = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < fpNames.length; i++) {
    const offset = i * dim;
    let dot = 0;
    for (let j = 0; j < dim; j++) {
      dot += tileFp[j] * fpVectors[offset + j];
    }
    if (dot > bestScore) {
      bestScore = dot;
      bestIdx   = i;
    }
  }

  if (bestIdx >= 0 && bestScore >= MIN_MATCH_SCORE) {
    return { name: fpNames[bestIdx], score: bestScore };
  }
  return null;
}

// ─── Tile classification (item/recipe) ───────────────────────────────────────

export function classifyFrame(imageData, gp) {
  const rows = [];
  for (let r = 0; r < gp.visibleRows; r++) {
    const cy = gp.row0Y + r * gp.cell;
    const ty = cy - gp.tileHalf;
    if (ty < 0 || cy + gp.tileHalf >= gp.height) {
      rows.push(null);
      continue;
    }
    const row = [];
    for (let c = 0; c < gp.cols; c++) {
      const cx = gp.col0X + c * gp.cell;
      const tx = cx - gp.tileHalf;
      if (tx < 0 || cx + gp.tileHalf >= gp.width) {
        row.push(false);
        continue;
      }
      const sat = meanSaturation(imageData, tx, ty,
                                 gp.tileHalf * 2, gp.tileHalf * 2);
      row.push(sat > SAT_THRESHOLD);
    }
    rows.push(row);
  }
  return rows;
}

// ─── Row-pattern scroll tracking (item/recipe) ──────────────────────────────

function rowsMatch(a, b, tolerance = 1) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff <= tolerance;
}

export function findRowShift(prevRows, currRows) {
  const n = Math.min(prevRows.length, currRows.length);
  if (n === 0) return 0;
  let bestShift = 0;
  let bestScore = -1;
  for (let shift = 0; shift <= n; shift++) {
    let matches = 0;
    let comparisons = 0;
    for (let i = 0; i < n - shift; i++) {
      const pi = shift + i;
      if (pi < prevRows.length && i < currRows.length &&
          prevRows[pi] && currRows[i]) {
        if (rowsMatch(prevRows[pi], currRows[i])) matches++;
        comparisons++;
      }
    }
    const score = matches * 10 + (n - shift);
    if (comparisons > 0 && matches >= comparisons * 0.6 && score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }
  return bestShift;
}

// ─── Shared utilities ────────────────────────────────────────────────────────

const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

function seekVideo(vid, t, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (timedOut = false) => {
      if (settled) return;
      settled = true;
      if (timedOut) console.warn(`[gridEngine] seekVideo timed out at t=${t.toFixed(2)}s`);
      resolve();
    };
    const timer = setTimeout(() => done(true), timeoutMs);
    vid.addEventListener('seeked', () => {
      clearTimeout(timer);
      done();
    }, { once: true });
    vid.currentTime = t;
  });
}

// ─── Item/Recipe scan pipeline ──────────────────────────────────────────────

async function scanItemRecipe(video, settings, onProgress, onMatch, signal) {
  const { frameIntervalMs = 100, scanMode = 'item' } = settings;
  const frameIntervalSec = Math.max(0.001, frameIntervalMs / 1000);
  const duration    = video.duration;
  const totalFrames = Math.ceil(duration / frameIntervalSec);
  const gp          = getModeParams(video.videoWidth, video.videoHeight, scanMode);

  let frameCanvas = document.createElement('canvas');
  frameCanvas.width  = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!frameCtx) throw new Error('Canvas context unavailable');

  const results       = new Map();
  let absRowOffset    = 0;
  let prevRows        = null;
  let processedFrames = 0;
  const seenPositions = new Set();
  let totalUndiscovered = 0;

  for (let time = 0; time < duration; time += frameIntervalSec) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    await seekVideo(video, time);
    frameCtx.drawImage(video, 0, 0);
    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);

    const currRows = classifyFrame(imageData, gp);

    if (prevRows) {
      const shift = findRowShift(prevRows, currRows);
      absRowOffset += shift;
    }

    const newItems = [];
    for (let r = 0; r < currRows.length; r++) {
      if (!currRows[r]) continue;
      const absRow = absRowOffset + r;
      for (let c = 0; c < gp.cols; c++) {
        const posKey = `${absRow}:${c}`;
        const discovered = currRows[r][c];

        if (discovered) {
          const cx = gp.col0X + c * gp.cell;
          const cy = gp.row0Y + r * gp.cell;
          const tx = cx - gp.tileHalf;
          const ty = cy - gp.tileHalf;
          const tw = gp.tileHalf * 2;
          const th = gp.tileHalf * 2;

          const tileFp = extractTileFingerprint(imageData, tx, ty, tw, th);
          if (tileFp) {
            const match = matchFingerprint(tileFp);
            if (match) {
              const { name, score } = match;
              if (!results.has(name) || score > results.get(name).matchScore) {
                const typeInfo = itemTypeMap.get(name) || { type: scanMode, category: 'Unknown' };
                const result = {
                  name,
                  type:       typeInfo.type,
                  category:   typeInfo.category,
                  discovered: true,
                  matchScore: score,
                };
                const isNew = !results.has(name);
                results.set(name, result);
                if (isNew) newItems.push(result);
              }
            }
          }
        } else {
          if (!seenPositions.has(posKey)) {
            seenPositions.add(posKey);
            totalUndiscovered++;
          }
        }
      }
      await yieldToBrowser();
    }

    if (newItems.length > 0) {
      onMatch({ items: newItems, frameIndex: processedFrames });
      await yieldToBrowser();
    }

    prevRows = currRows;
    processedFrames++;

    const discoveredCount = results.size;
    const previewDataUrl  = frameCanvas.toDataURL('image/jpeg', 0.4);
    onProgress({
      phase:        'scanning',
      current:      processedFrames,
      total:        totalFrames,
      percent:      Math.round((processedFrames / totalFrames) * 100),
      message:      `Grid scan: ${processedFrames}/${totalFrames} frames | `
                  + `${discoveredCount} items identified`,
      currentFrame: previewDataUrl,
      timePosition: time,
      duration,
    });
    await yieldToBrowser();

    if (processedFrames % 5 === 0) await yieldToBrowser();
  }

  // Add undiscovered entries
  const dataList = scanMode === 'recipe' ? recipeList : itemList;
  for (const entry of dataList) {
    if (!results.has(entry.name)) {
      results.set(entry.name, {
        name:       entry.name,
        type:       scanMode,
        category:   entry.category || 'Unknown',
        discovered: false,
        matchScore: 0,
      });
    }
  }

  // Cleanup
  frameCanvas.width = 1;
  frameCanvas.height = 1;
  frameCanvas = null;

  return results;
}

// ─── Pokémon scan pipeline ──────────────────────────────────────────────────

async function scanPokemon(video, settings, onProgress, onMatch, signal) {
  const { frameIntervalMs = 100 } = settings;
  const frameIntervalSec = frameIntervalMs / 1000;
  const duration    = video.duration;
  const totalFrames = Math.ceil(duration / frameIntervalSec);
  const mp          = getModeParams(video.videoWidth, video.videoHeight, 'pokemon');

  let frameCanvas = document.createElement('canvas');
  frameCanvas.width  = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

  const results       = new Map();  // name → result
  let cumPixelOffset  = 0;
  let prevProfile     = null;
  let processedFrames = 0;
  let capturedCount   = 0;
  let sensedCount     = 0;

  // Compute row center Ys (scaled)
  const rowYs = [];
  for (let r = 0; r < mp.visibleRows; r++) {
    rowYs.push(mp.row0Y + r * mp.rowSpacing);
  }

  for (let time = 0; time < duration; time += frameIntervalSec) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    await seekVideo(video, time);
    frameCtx.drawImage(video, 0, 0);
    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);

    // Cross-correlation scroll tracking
    const currProfile = normalizeProfile(
      extractVerticalProfile(imageData, mp.stripX, mp.stripW, mp.yStart, mp.yEnd)
    );

    if (prevProfile) {
      const { shift, correlation } = measurePixelShift(
        prevProfile, currProfile, XCORR_MAX_SHIFT
      );
      if (correlation > XCORR_MIN_CORR) {
        cumPixelOffset += shift;
      }
    }
    prevProfile = currProfile;

    // Classify each visible tile
    const newItems = [];
    for (let r = 0; r < mp.visibleRows; r++) {
      const cy = rowYs[r];
      if (cy - mp.tileHalf < 0 || cy + mp.tileHalf >= mp.height) continue;

      // Compute absolute row for this visible row
      const absRow = Math.round((cy + cumPixelOffset - mp.row0Y) / mp.rowSpacing);
      if (absRow < 0) continue;

      for (let c = 0; c < mp.cols; c++) {
        const cx = mp.tileXs[c];
        if (cx - mp.tileHalf < 0 || cx + mp.tileHalf >= mp.width) continue;

        const cls = classifyPokemonTile(imageData, cx, cy, mp.tileHalf);
        const idx = absRow * POKE_COLS + c;
        if (idx < 0 || idx >= pokemonList.length) continue;

        const entry = pokemonList[idx];
        const existing = results.get(entry.name);

        if (cls === 'C') {
          // Captured — always upgrade
          if (!existing || !existing.captured) {
            const result = {
              name:     entry.name,
              type:     'pokemon',
              category: entry.species || 'Pokémon',
              captured: true,
              sensed:   true,  // captured implies sensed
            };
            const isNew = !existing;
            results.set(entry.name, result);
            if (isNew) {
              capturedCount++;
              newItems.push(result);
            } else if (!existing.captured) {
              capturedCount++;
              if (existing.sensed) sensedCount--; // was counted as sensed-only
            }
          }
        } else if (cls === 'S') {
          // Sensed (silhouette) — only set if not already captured
          if (!existing) {
            const result = {
              name:     entry.name,
              type:     'pokemon',
              category: entry.species || 'Pokémon',
              captured: false,
              sensed:   true,
            };
            results.set(entry.name, result);
            sensedCount++;
            newItems.push(result);
          }
        }
        // cls === 'U' (unknown/?) — we don't record these during scanning
      }
      await yieldToBrowser();
    }

    if (newItems.length > 0) {
      onMatch({ items: newItems, frameIndex: processedFrames });
      await yieldToBrowser();
    }

    processedFrames++;

    const previewDataUrl = frameCanvas.toDataURL('image/jpeg', 0.4);
    onProgress({
      phase:        'scanning',
      current:      processedFrames,
      total:        totalFrames,
      percent:      Math.round((processedFrames / totalFrames) * 100),
      message:      `Pokémon scan: ${processedFrames}/${totalFrames} frames | `
                  + `${capturedCount} captured, ${sensedCount} sensed`,
      currentFrame: previewDataUrl,
      timePosition: time,
      duration,
    });
    await yieldToBrowser();

    if (processedFrames % 5 === 0) await yieldToBrowser();
  }

  // Add remaining pokemon as unknown
  for (const entry of pokemonList) {
    if (!results.has(entry.name)) {
      results.set(entry.name, {
        name:     entry.name,
        type:     'pokemon',
        category: entry.species || 'Pokémon',
        captured: false,
        sensed:   false,
      });
    }
  }

  // Cleanup
  frameCanvas.width = 1;
  frameCanvas.height = 1;
  frameCanvas = null;

  return results;
}

// ─── Habitat scan pipeline ──────────────────────────────────────────────────

async function scanHabitat(video, settings, onProgress, onMatch, signal) {
  const { frameIntervalMs = 100 } = settings;
  const frameIntervalSec = frameIntervalMs / 1000;
  const duration    = video.duration;
  const totalFrames = Math.ceil(duration / frameIntervalSec);
  const mp          = getModeParams(video.videoWidth, video.videoHeight, 'habitat');

  let frameCanvas = document.createElement('canvas');
  frameCanvas.width  = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

  const results       = new Map();
  let cumPixelOffset  = 0;
  let prevProfile     = null;
  let processedFrames = 0;
  let builtCount      = 0;
  let unbuiltCount    = 0;

  // Compute row center Ys (scaled)
  const rowYs = [];
  for (let r = 0; r < mp.visibleRows; r++) {
    rowYs.push(mp.row0Y + r * mp.rowSpacing);
  }

  for (let time = 0; time < duration; time += frameIntervalSec) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    await seekVideo(video, time);
    frameCtx.drawImage(video, 0, 0);
    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);

    // Cross-correlation scroll tracking
    const currProfile = normalizeProfile(
      extractVerticalProfile(imageData, mp.stripX, mp.stripW, mp.yStart, mp.yEnd)
    );

    if (prevProfile) {
      const { shift, correlation } = measurePixelShift(
        prevProfile, currProfile, XCORR_MAX_SHIFT
      );
      if (correlation > XCORR_MIN_CORR) {
        cumPixelOffset += shift;
      }
    }
    prevProfile = currProfile;

    // Classify each visible tile
    const newItems = [];
    for (let r = 0; r < mp.visibleRows; r++) {
      const cy = rowYs[r];
      if (cy - mp.tileHH < 0 || cy + mp.tileHH >= mp.height) continue;

      const absRow = Math.round((cy + cumPixelOffset - mp.row0Y) / mp.rowSpacing);
      if (absRow < 0) continue;

      for (let c = 0; c < mp.cols; c++) {
        const cx = mp.tileXs[c];
        if (cx - mp.tileHW < 0 || cx + mp.tileHW >= mp.width) continue;

        const cls = classifyHabitatTile(imageData, cx, cy, mp.tileHW, mp.tileHH);
        if (cls === 'E') continue; // Skip empty/transition frames

        const idx = absRow * HAB_COLS + c;
        if (idx < 0 || idx >= habitatList.length) continue;

        const entry = habitatList[idx];
        const existing = results.get(entry.name);

        if (cls === 'B') {
          // Built — always upgrade
          if (!existing || !existing.built) {
            const result = {
              name:       entry.name,
              type:       'habitat',
              category:   'Habitat',
              built:      true,
              discovered: true,
            };
            const isNew = !existing;
            results.set(entry.name, result);
            if (isNew) {
              builtCount++;
              newItems.push(result);
            } else if (!existing.built) {
              builtCount++;
              unbuiltCount--;
            }
          }
        } else if (cls === 'U') {
          // Unbuilt (purple) — only set if not already known
          if (!existing) {
            const result = {
              name:       entry.name,
              type:       'habitat',
              category:   'Habitat',
              built:      false,
              discovered: true,
            };
            results.set(entry.name, result);
            unbuiltCount++;
            newItems.push(result);
          }
        }
      }
      await yieldToBrowser();
    }

    if (newItems.length > 0) {
      onMatch({ items: newItems, frameIndex: processedFrames });
      await yieldToBrowser();
    }

    processedFrames++;

    const previewDataUrl = frameCanvas.toDataURL('image/jpeg', 0.4);
    onProgress({
      phase:        'scanning',
      current:      processedFrames,
      total:        totalFrames,
      percent:      Math.round((processedFrames / totalFrames) * 100),
      message:      `Habitat scan: ${processedFrames}/${totalFrames} frames | `
                  + `${builtCount} built, ${unbuiltCount} unbuilt`,
      currentFrame: previewDataUrl,
      timePosition: time,
      duration,
    });
    await yieldToBrowser();

    if (processedFrames % 5 === 0) await yieldToBrowser();
  }

  // Add remaining habitats as undiscovered
  for (const entry of habitatList) {
    if (!results.has(entry.name)) {
      results.set(entry.name, {
        name:       entry.name,
        type:       'habitat',
        category:   'Habitat',
        built:      false,
        discovered: false,
      });
    }
  }

  // Cleanup
  frameCanvas.width = 1;
  frameCanvas.height = 1;
  frameCanvas = null;

  return results;
}

// ─── Main scanning entry point ──────────────────────────────────────────────

/**
 * Scan a video of a scrolling grid.
 *
 * @param {HTMLVideoElement} video
 * @param {object}   settings - must include scanMode: 'item'|'recipe'|'pokemon'|'habitat'
 * @param {Function} onProgress
 * @param {Function} onMatch
 * @param {AbortSignal} signal
 * @returns {Promise<Map<string, object>>}
 */
export async function scanGridVideo(
  video, settings, onProgress, onMatch, signal,
) {
  await ensureGridData();
  const { scanMode = 'item' } = settings;

  if (scanMode === 'pokemon') {
    return scanPokemon(video, settings, onProgress, onMatch, signal);
  }
  if (scanMode === 'habitat') {
    return scanHabitat(video, settings, onProgress, onMatch, signal);
  }
  // item or recipe
  return scanItemRecipe(video, settings, onProgress, onMatch, signal);
}

/**
 * Get the dataset list for a scan mode.
 */
export async function getGridDataList(scanMode) {
  await ensureGridData();
  if (scanMode === 'pokemon') return pokemonList;
  if (scanMode === 'habitat') return habitatList;
  if (scanMode === 'recipe')  return recipeList;
  return itemList;
}

export default {
  detectGridParams,
  classifyFrame,
  findRowShift,
  scanGridVideo,
  getGridDataList,
};
