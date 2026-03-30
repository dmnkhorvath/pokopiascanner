/**
 * Grid-based Scanner Engine with Icon Fingerprint Matching
 *
 * Detects item/recipe grids in video frames, classifies tiles as
 * discovered vs undiscovered using saturation analysis, and identifies
 * discovered items via normalized cross-correlation (NCC) against
 * pre-computed 16×16 grayscale fingerprints.
 *
 * No scroll tracking needed for identification — each tile is matched
 * independently against the full reference database.
 *
 * Works entirely with canvas pixel operations — no ML dependencies.
 */

import pokopiaDataset from '../assets/pokopiaDataset.json';
import fingerprintData from '../assets/iconFingerprints.json';

// ─── Reference layout (1920×1080) ────────────────────────────────────────────

const REF_WIDTH  = 1920;
const REF_HEIGHT = 1080;
const REF_CELL   = 138;   // px between tile centers
const REF_COL0_X = 201;   // first column center x
const REF_ROW0_Y = 298;   // first row center y
const REF_COLS   = 12;
const REF_VISIBLE_ROWS = 5;
const REF_TILE_HALF = 55; // half-tile crop radius (slightly larger for full icon)

// Tile classification
const SAT_THRESHOLD = 15; // mean saturation above this → discovered

// Fingerprint matching
const FP_SIZE  = fingerprintData.size;   // 16
const FP_SCALE = fingerprintData.scale;  // 10000
const MIN_MATCH_SCORE = 0.65; // minimum NCC to accept a match

// ─── Dataset ordering ────────────────────────────────────────────────────────

const itemList   = pokopiaDataset.items   || [];
const recipeList = pokopiaDataset.recipes || [];

// ─── Pre-process fingerprint database ────────────────────────────────────────

// Convert quantized int16 arrays to normalized Float32Arrays for fast NCC
const fpNames = Object.keys(fingerprintData.fingerprints);
const fpVectors = new Float32Array(fpNames.length * FP_SIZE * FP_SIZE);

(function initFingerprints() {
  const dim = FP_SIZE * FP_SIZE; // 256
  for (let i = 0; i < fpNames.length; i++) {
    const quantized = fingerprintData.fingerprints[fpNames[i]];
    const offset = i * dim;
    for (let j = 0; j < dim; j++) {
      fpVectors[offset + j] = quantized[j] / FP_SCALE;
    }
  }
})();

// Build a lookup from item name → type info from the dataset
const itemTypeMap = new Map();
for (const entry of itemList) {
  itemTypeMap.set(entry.name, { type: 'item', category: entry.category || 'Unknown' });
}
for (const entry of recipeList) {
  itemTypeMap.set(entry.name, { type: 'recipe', category: entry.category || 'Unknown' });
}

// ─── Scaled grid parameters ─────────────────────────────────────────────────

export function detectGridParams(videoWidth, videoHeight) {
  const sx = videoWidth  / REF_WIDTH;
  const sy = videoHeight / REF_HEIGHT;
  return {
    cols:        REF_COLS,
    visibleRows: REF_VISIBLE_ROWS,
    cell:        Math.round(REF_CELL   * sx),
    col0X:       Math.round(REF_COL0_X * sx),
    row0Y:       Math.round(REF_ROW0_Y * sy),
    tileHalf:    Math.round(REF_TILE_HALF * Math.min(sx, sy)),
    width:       videoWidth,
    height:      videoHeight,
  };
}

// ─── Pixel helpers ───────────────────────────────────────────────────────────

/**
 * Compute mean saturation for a rectangular region of an ImageData.
 * Samples every 2nd pixel for speed.
 */
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

// ─── Icon fingerprint extraction ─────────────────────────────────────────────

/**
 * Extract a 16×16 normalized grayscale fingerprint from a tile canvas region.
 *
 * Pipeline (mirrors the Python build-time process):
 *  1. Read tile pixels from ImageData
 *  2. Classify each pixel as background (low saturation, high value) or icon
 *  3. Find bounding box of icon pixels
 *  4. Crop to content, pad to square
 *  5. Resize to 16×16 using area averaging
 *  6. Convert to grayscale, normalize (subtract mean, divide by L2 norm)
 *
 * @param {ImageData} imageData - Full frame image data
 * @param {number} tx - Tile top-left x
 * @param {number} ty - Tile top-left y
 * @param {number} tw - Tile width
 * @param {number} th - Tile height
 * @returns {Float32Array|null} - Normalized 256-element fingerprint or null
 */
function extractTileFingerprint(imageData, tx, ty, tw, th) {
  const { data, width } = imageData;

  // Step 1: Find icon bounding box by excluding low-sat high-value background
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
      // Background: low saturation AND high value (lavender/white)
      if (sat < 0.10 && val > 0.70) continue;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      hasIcon = true;
    }
  }

  if (!hasIcon || maxX - minX < 3 || maxY - minY < 3) return null;

  // Step 2: Extract cropped icon as RGB array
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const sq = Math.max(cw, ch);
  const ox = Math.floor((sq - cw) / 2);
  const oy = Math.floor((sq - ch) / 2);

  // Create square canvas with white background
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

  // Step 3: Resize to FP_SIZE×FP_SIZE using area averaging
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
          // Grayscale: 0.299R + 0.587G + 0.114B
          sum += 0.299 * squarePixels[idx] + 0.587 * squarePixels[idx + 1] + 0.114 * squarePixels[idx + 2];
          cnt++;
        }
      }
      fp[fy * FP_SIZE + fx] = cnt > 0 ? sum / cnt : 255;
    }
  }

  // Step 4: Normalize (subtract mean, divide by L2 norm)
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

/**
 * Match a tile fingerprint against the reference database.
 * Returns { name, score } or null if no match above threshold.
 */
function matchFingerprint(tileFp) {
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

// ─── Tile classification ─────────────────────────────────────────────────────

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

// ─── Row-pattern scroll tracking (for undiscovered counting) ─────────────────

function rowKey(row) {
  if (!row) return null;
  return row.map(v => v ? '1' : '0').join('');
}

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

// ─── Main scanning pipeline ─────────────────────────────────────────────────

/**
 * Scan a video of a scrolling item/recipe grid using icon fingerprint matching.
 *
 * Algorithm:
 *  1. For each frame, classify all visible tiles as discovered / undiscovered.
 *  2. For each discovered tile, extract a 16×16 fingerprint and match it
 *     against the pre-computed reference database via NCC.
 *  3. Track scroll position via D/U row patterns to count total rows
 *     (for undiscovered tile counting).
 *  4. Deduplicate: each unique item name is recorded once with best score.
 *
 * @param {HTMLVideoElement} video
 * @param {object}   settings
 * @param {Function} onProgress
 * @param {Function} onMatch
 * @param {AbortSignal} signal
 * @returns {Promise<Map<string, object>>}
 */
export async function scanGridVideo(
  video, settings, onProgress, onMatch, signal,
) {
  const {
    frameIntervalMs = 100,
    scanMode        = 'item',
  } = settings;

  const frameIntervalSec = frameIntervalMs / 1000;
  const duration    = video.duration;
  const totalFrames = Math.ceil(duration / frameIntervalSec);
  const gp          = detectGridParams(video.videoWidth, video.videoHeight);
  const dataList    = scanMode === 'recipe' ? recipeList : itemList;
  const totalItems  = dataList.length;

  // Canvas for frame capture
  let frameCanvas = document.createElement('canvas');
  frameCanvas.width  = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

  const results       = new Map();   // name → result object
  let absRowOffset    = 0;
  let prevRows        = null;
  let processedFrames = 0;
  let totalUndiscovered = 0;         // count of unique undiscovered positions
  const seenPositions = new Set();   // track grid positions we've seen

  const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

  for (let time = 0; time < duration; time += frameIntervalSec) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    // Seek
    video.currentTime = time;
    await new Promise(resolve => { video.onseeked = resolve; });

    // Draw frame
    frameCtx.drawImage(video, 0, 0);
    const imageData = frameCtx.getImageData(0, 0,
                                            frameCanvas.width, frameCanvas.height);

    // Classify tiles
    const currRows = classifyFrame(imageData, gp);

    // Detect scroll shift for position tracking
    if (prevRows) {
      const shift = findRowShift(prevRows, currRows);
      absRowOffset += shift;
    }

    // Process each tile
    const newItems = [];
    for (let r = 0; r < currRows.length; r++) {
      if (!currRows[r]) continue;
      const absRow = absRowOffset + r;
      for (let c = 0; c < gp.cols; c++) {
        const posKey = `${absRow}:${c}`;
        const discovered = currRows[r][c];

        if (discovered) {
          // Extract fingerprint and match
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
          // Track undiscovered positions
          if (!seenPositions.has(posKey)) {
            seenPositions.add(posKey);
            totalUndiscovered++;
          }
        }
      }
    }

    if (newItems.length > 0) {
      onMatch({ items: newItems, frameIndex: processedFrames });
      await yieldToBrowser();
    }

    prevRows = currRows;
    processedFrames++;

    // Progress
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

  // Add undiscovered entries from the dataset for items NOT matched
  // This gives a complete picture of what's missing
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
  prevRows = null;
  frameCanvas.width = 1;
  frameCanvas.height = 1;
  frameCanvas = null;

  return results;
}

/**
 * Get the dataset list for a scan mode.
 */
export function getGridDataList(scanMode) {
  return scanMode === 'recipe' ? recipeList : itemList;
}

export default {
  detectGridParams,
  classifyFrame,
  findRowShift,
  scanGridVideo,
  getGridDataList,
};
