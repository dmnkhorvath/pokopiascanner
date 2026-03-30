/**
 * Grid-based Scanner Engine for Pokopia Progress Scanner
 *
 * Detects item/recipe grids in video frames, classifies tiles as
 * discovered vs undiscovered using saturation analysis, tracks scroll
 * position via D/U row-pattern matching between consecutive frames,
 * and maps grid positions to dataset entries.
 *
 * Works entirely with canvas pixel operations — no ML dependencies.
 *
 * Proven against real gameplay video: 93/105 rows detected (89% coverage)
 * from a 24-second scrolling capture at 10fps.
 */

import pokopiaDataset from '../assets/pokopiaDataset.json';

// ─── Reference layout (1920×1080) ────────────────────────────────────────────

const REF_WIDTH  = 1920;
const REF_HEIGHT = 1080;
const REF_CELL   = 138;   // px between tile centers
const REF_COL0_X = 201;   // first column center x
const REF_ROW0_Y = 298;   // first row center y
const REF_COLS   = 12;
const REF_VISIBLE_ROWS = 5;
const REF_TILE_HALF = 47; // half-tile crop radius

// Tile classification
const SAT_THRESHOLD = 15; // mean saturation above this → discovered

// ─── Dataset ordering ────────────────────────────────────────────────────────

const itemList   = pokopiaDataset.items   || [];
const recipeList = pokopiaDataset.recipes || [];

// ─── Scaled grid parameters ─────────────────────────────────────────────────

/**
 * Compute grid geometry scaled to actual video resolution.
 */
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
      // Fast saturation: 1 - min/max
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : ((max - min) / max) * 100;
      totalSat += sat;
      count++;
    }
  }
  return count > 0 ? totalSat / count : 0;
}

// ─── Tile classification ─────────────────────────────────────────────────────

/**
 * Classify all visible tiles in a frame.
 * Returns array of 5 rows, each row is array of 12 booleans (true = discovered).
 */
export function classifyFrame(imageData, gp) {
  const rows = [];
  for (let r = 0; r < gp.visibleRows; r++) {
    const cy = gp.row0Y + r * gp.cell;
    const ty = cy - gp.tileHalf;
    // Skip rows that fall outside the frame
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

// ─── Row-pattern scroll tracking ─────────────────────────────────────────────

/**
 * Convert a row of booleans to a compact string key for comparison.
 */
function rowKey(row) {
  if (!row) return null;
  return row.map(v => v ? '1' : '0').join('');
}

/**
 * Check if two row patterns match (allow tolerance for transition frames).
 */
function rowsMatch(a, b, tolerance = 1) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff <= tolerance;
}

/**
 * Determine how many rows the grid scrolled between two consecutive frames.
 *
 * Compares the D/U pattern of each row: if prev rows [shift..N] match
 * curr rows [0..N-shift], the grid scrolled down by `shift` rows.
 *
 * @param {boolean[][]} prevRows – previous frame's classified rows
 * @param {boolean[][]} currRows – current  frame's classified rows
 * @returns {number} row shift (0 = no scroll, 1 = scrolled 1 row, …)
 */
export function findRowShift(prevRows, currRows) {
  const n = Math.min(prevRows.length, currRows.length);
  if (n === 0) return 0;

  let bestShift  = 0;
  let bestScore  = -1;

  for (let shift = 0; shift <= n; shift++) {
    let matches     = 0;
    let comparisons = 0;
    for (let i = 0; i < n - shift; i++) {
      const pi = shift + i;
      if (pi < prevRows.length && i < currRows.length &&
          prevRows[pi] && currRows[i]) {
        if (rowsMatch(prevRows[pi], currRows[i])) matches++;
        comparisons++;
      }
    }
    // Prefer smaller shifts when tied; require ≥60 % overlap match
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
 * Scan a video of a scrolling item/recipe grid.
 *
 * Algorithm:
 *  1. For each frame, classify all visible tiles as discovered / undiscovered.
 *  2. Compare the D/U row patterns with the previous frame to detect how
 *     many rows the grid scrolled (0, 1, 2, …).
 *  3. Accumulate an absolute row offset and map each tile to its dataset
 *     index  (absRow × 12 + col).
 *  4. Track unique items; update discovered status if a tile is seen as
 *     discovered in any frame.
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
    frameIntervalMs = 100,   // default ~10 fps
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
  let absRowOffset    = 0;           // absolute row of the top visible row
  let prevRows        = null;        // previous frame's classified rows
  let processedFrames = 0;

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

    // Detect scroll shift
    if (prevRows) {
      const shift = findRowShift(prevRows, currRows);
      absRowOffset += shift;
    }

    // Map tiles to dataset entries
    const newItems = [];
    for (let r = 0; r < currRows.length; r++) {
      if (!currRows[r]) continue;
      const absRow = absRowOffset + r;
      for (let c = 0; c < gp.cols; c++) {
        const absIndex = absRow * gp.cols + c;
        if (absIndex < 0 || absIndex >= totalItems) continue;

        const entry      = dataList[absIndex];
        const name       = entry.name;
        const discovered = currRows[r][c];

        if (!results.has(name)) {
          const result = {
            name,
            type:       scanMode,
            category:   entry.category || 'Unknown',
            discovered,
            gridIndex:  absIndex,
          };
          results.set(name, result);
          if (discovered) newItems.push(result);
        } else if (discovered && !results.get(name).discovered) {
          // Upgrade undiscovered → discovered
          results.get(name).discovered = true;
          newItems.push(results.get(name));
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
    const discoveredCount = [...results.values()].filter(r => r.discovered).length;
    const previewDataUrl  = frameCanvas.toDataURL('image/jpeg', 0.4);
    onProgress({
      phase:        'scanning',
      current:      processedFrames,
      total:        totalFrames,
      percent:      Math.round((processedFrames / totalFrames) * 100),
      message:      `Grid scan: ${processedFrames}/${totalFrames} frames | `
                  + `${results.size} entries mapped `
                  + `(${discoveredCount} discovered)`,
      currentFrame: previewDataUrl,
      timePosition: time,
      duration,
    });
    await yieldToBrowser();

    if (processedFrames % 5 === 0) await yieldToBrowser();
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