/**
 * Grid-based Scanner Engine for Pokopia Progress Scanner
 * 
 * Detects item/recipe grids in video frames, classifies tiles as
 * discovered vs undiscovered, tracks scroll position across frames,
 * and maps grid positions to dataset entries.
 * 
 * Works entirely with canvas pixel operations — no ML dependencies.
 */

import pokopiaDataset from '../assets/pokopiaDataset.json';

// ─── Constants ───────────────────────────────────────────────────────────────

// Grid layout at 1920×1080 (detected from sample video analysis)
const REF_WIDTH = 1920;
const REF_HEIGHT = 1080;
const REF_TILE_SPACING = 138;  // px between tile centers at 1080p
const REF_TILE_SIZE = 120;     // approximate tile icon area
const REF_COLS = 12;           // columns in the grid

// Tile classification thresholds
const UNDISCOVERED_SAT_MAX = 25;    // max avg saturation for a '?' tile
const UNDISCOVERED_VAR_MAX = 800;   // max color variance for a '?' tile
const DISCOVERED_SAT_MIN = 15;      // min avg saturation for a discovered tile
const MIN_TILE_BRIGHTNESS = 30;     // ignore very dark tiles (UI chrome)
const MAX_TILE_BRIGHTNESS = 245;    // ignore very bright tiles (empty bg)

// Scroll tracking
const OVERLAP_STRIP_HEIGHT = 80;    // px height of strip used for correlation
const MIN_SCROLL_PX = 5;            // minimum scroll to count as movement

// ─── Dataset ordering ────────────────────────────────────────────────────────

/**
 * Build ordered lists of items and recipes from the dataset.
 * The order in the dataset file should match the in-game grid order.
 * If it doesn't, the user can still get discovered/undiscovered counts.
 */
const itemList = pokopiaDataset.items || [];
const recipeList = pokopiaDataset.recipes || [];

// ─── Pixel helpers ───────────────────────────────────────────────────────────

/**
 * Convert RGB to HSL, return saturation (0-100) and lightness (0-100)
 */
function rgbToSL(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }
  return { s: s * 100, l: l * 100 };
}

/**
 * Compute average saturation, brightness, and color variance for a tile region.
 * @param {ImageData} imageData - full frame image data
 * @param {number} x - tile left
 * @param {number} y - tile top
 * @param {number} w - tile width
 * @param {number} h - tile height
 * @returns {{ avgSat: number, avgBright: number, variance: number }}
 */
function analyzeTileRegion(imageData, x, y, w, h) {
  const { data, width } = imageData;
  let totalSat = 0;
  let totalBright = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  let totalR2 = 0, totalG2 = 0, totalB2 = 0;
  let count = 0;

  // Sample every 2nd pixel for speed
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      const idx = (py * width + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const { s, l } = rgbToSL(r, g, b);
      totalSat += s;
      totalBright += l;
      totalR += r; totalG += g; totalB += b;
      totalR2 += r * r; totalG2 += g * g; totalB2 += b * b;
      count++;
    }
  }

  if (count === 0) return { avgSat: 0, avgBright: 50, variance: 0 };

  const avgSat = totalSat / count;
  const avgBright = totalBright / count;
  // Color variance = sum of channel variances
  const varR = (totalR2 / count) - (totalR / count) ** 2;
  const varG = (totalG2 / count) - (totalG / count) ** 2;
  const varB = (totalB2 / count) - (totalB / count) ** 2;
  const variance = varR + varG + varB;

  return { avgSat, avgBright, variance };
}

// ─── Grid detection ──────────────────────────────────────────────────────────

/**
 * Detect grid parameters scaled to the actual video resolution.
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @returns {{ cols, tileSpacing, tileSize, gridLeft, gridTop, gridBottom }}
 */
export function detectGridParams(videoWidth, videoHeight) {
  const scale = videoWidth / REF_WIDTH;
  const tileSpacing = Math.round(REF_TILE_SPACING * scale);
  const tileSize = Math.round(REF_TILE_SIZE * scale);
  const cols = REF_COLS;

  // The grid is roughly centered horizontally with some padding
  // At 1920px: ~12 tiles × 138px = 1656px, leaving ~132px padding each side
  const gridWidth = cols * tileSpacing;
  const gridLeft = Math.round((videoWidth - gridWidth) / 2);

  // The grid starts below the top UI bar (~15% from top) and ends above
  // the bottom bar (~85% from top)
  const gridTop = Math.round(videoHeight * 0.15);
  const gridBottom = Math.round(videoHeight * 0.85);

  return { cols, tileSpacing, tileSize, gridLeft, gridTop, gridBottom };
}

/**
 * Find tile centers in a frame by looking for the grid pattern.
 * Returns array of { col, row, x, y, centerX, centerY } for each detected tile.
 * Row is relative to the visible frame (0 = first visible row).
 */
export function findTilesInFrame(imageData, gridParams) {
  const { cols, tileSpacing, tileSize, gridLeft, gridTop, gridBottom } = gridParams;
  const tiles = [];
  const halfTile = Math.round(tileSize / 2);

  // Calculate visible rows
  const visibleHeight = gridBottom - gridTop;
  const visibleRows = Math.floor(visibleHeight / tileSpacing);

  for (let row = 0; row < visibleRows; row++) {
    const centerY = gridTop + Math.round(tileSpacing * (row + 0.5));
    for (let col = 0; col < cols; col++) {
      const centerX = gridLeft + Math.round(tileSpacing * (col + 0.5));
      const tileX = centerX - halfTile;
      const tileY = centerY - halfTile;

      // Bounds check
      if (tileX < 0 || tileY < 0 ||
          tileX + tileSize > imageData.width ||
          tileY + tileSize > imageData.height) continue;

      tiles.push({
        col, row,
        x: tileX, y: tileY,
        centerX, centerY,
        w: tileSize, h: tileSize,
      });
    }
  }

  return tiles;
}

// ─── Tile classification ─────────────────────────────────────────────────────

/**
 * Classify a tile as 'discovered', 'undiscovered', or 'empty'.
 * @param {ImageData} imageData
 * @param {{ x, y, w, h }} tile
 * @returns {{ status: string, avgSat: number, avgBright: number, variance: number }}
 */
export function classifyTile(imageData, tile) {
  const stats = analyzeTileRegion(imageData, tile.x, tile.y, tile.w, tile.h);

  // Very dark or very bright = UI chrome or empty background
  if (stats.avgBright < MIN_TILE_BRIGHTNESS || stats.avgBright > MAX_TILE_BRIGHTNESS) {
    return { status: 'empty', ...stats };
  }

  // Low saturation + low variance = grey '?' tile
  if (stats.avgSat < UNDISCOVERED_SAT_MAX && stats.variance < UNDISCOVERED_VAR_MAX) {
    return { status: 'undiscovered', ...stats };
  }

  // Otherwise it's a discovered (colorful) tile
  return { status: 'discovered', ...stats };
}

// ─── Scroll tracking ─────────────────────────────────────────────────────────

/**
 * Extract a horizontal strip of pixel data for scroll correlation.
 * Uses a strip from the middle of the grid area.
 * @param {ImageData} imageData
 * @param {object} gridParams
 * @param {string} position - 'top' or 'bottom' of grid area
 * @returns {Uint8Array} grayscale strip
 */
function extractCorrelationStrip(imageData, gridParams, position) {
  const { gridLeft, gridTop, gridBottom, cols, tileSpacing } = gridParams;
  const stripWidth = cols * tileSpacing;
  const stripHeight = OVERLAP_STRIP_HEIGHT;
  const stripY = position === 'top'
    ? gridTop
    : gridBottom - stripHeight;

  const strip = new Uint8Array(stripWidth * stripHeight);
  const { data, width } = imageData;

  for (let y = 0; y < stripHeight; y++) {
    for (let x = 0; x < stripWidth; x++) {
      const srcIdx = ((stripY + y) * width + (gridLeft + x)) * 4;
      // Grayscale
      strip[y * stripWidth + x] = Math.round(
        data[srcIdx] * 0.299 + data[srcIdx + 1] * 0.587 + data[srcIdx + 2] * 0.114
      );
    }
  }

  return strip;
}

/**
 * Estimate vertical scroll offset between two frames using normalized
 * cross-correlation on bottom strip of prev frame vs sliding window on next frame.
 * @param {ImageData} prevImageData
 * @param {ImageData} currImageData
 * @param {object} gridParams
 * @returns {number} estimated scroll in pixels (positive = scrolled down)
 */
export function estimateScroll(prevImageData, currImageData, gridParams) {
  const { gridLeft, gridTop, gridBottom, cols, tileSpacing } = gridParams;
  const stripWidth = cols * tileSpacing;
  const stripHeight = OVERLAP_STRIP_HEIGHT;

  // Extract reference strip from bottom of previous frame
  const refStrip = extractCorrelationStrip(prevImageData, gridParams, 'bottom');

  // Search in the current frame: slide the reference strip vertically
  const searchTop = gridTop;
  const searchBottom = gridBottom - stripHeight;
  const { data, width } = currImageData;

  let bestOffset = 0;
  let bestScore = -Infinity;

  // Coarse search: every 4 pixels
  for (let searchY = searchTop; searchY <= searchBottom; searchY += 4) {
    let score = 0;
    // Sample every 4th pixel for speed
    for (let y = 0; y < stripHeight; y += 4) {
      for (let x = 0; x < stripWidth; x += 4) {
        const srcIdx = ((searchY + y) * width + (gridLeft + x)) * 4;
        const gray = Math.round(
          data[srcIdx] * 0.299 + data[srcIdx + 1] * 0.587 + data[srcIdx + 2] * 0.114
        );
        const refVal = refStrip[y * stripWidth + x];
        // Negative absolute difference = similarity
        score -= Math.abs(gray - refVal);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = searchY;
    }
  }

  // Fine search: ±6 pixels around best coarse match
  const fineStart = Math.max(searchTop, bestOffset - 6);
  const fineEnd = Math.min(searchBottom, bestOffset + 6);
  for (let searchY = fineStart; searchY <= fineEnd; searchY++) {
    let score = 0;
    for (let y = 0; y < stripHeight; y += 2) {
      for (let x = 0; x < stripWidth; x += 2) {
        const srcIdx = ((searchY + y) * width + (gridLeft + x)) * 4;
        const gray = Math.round(
          data[srcIdx] * 0.299 + data[srcIdx + 1] * 0.587 + data[srcIdx + 2] * 0.114
        );
        const refVal = refStrip[y * stripWidth + x];
        score -= Math.abs(gray - refVal);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = searchY;
    }
  }

  // The scroll amount is: where the bottom strip of prev frame now appears
  // in the current frame, relative to where it was.
  const prevStripY = gridBottom - stripHeight;
  const scrollPx = prevStripY - bestOffset;

  return Math.abs(scrollPx) < MIN_SCROLL_PX ? 0 : scrollPx;
}

// ─── Grid scanning pipeline ─────────────────────────────────────────────────

/**
 * Scan a single frame for grid tiles and classify them.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - frame canvas
 * @param {object} gridParams
 * @returns {{ tiles: Array<{col, row, status, ...}>, imageData: ImageData }}
 */
export function scanGridFrame(canvas, gridParams) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tiles = findTilesInFrame(imageData, gridParams);

  const classifiedTiles = tiles.map(tile => {
    const classification = classifyTile(imageData, tile);
    return { ...tile, ...classification };
  });

  return { tiles: classifiedTiles, imageData };
}

/**
 * Main grid scanning function — processes video frames, tracks scroll,
 * builds a complete grid map, and maps positions to dataset entries.
 * 
 * This is called from scanVideo() in ocrEngine.js when scanMode is 'item' or 'recipe'.
 * 
 * @param {HTMLVideoElement} video - loaded video element
 * @param {object} settings - scanner settings
 * @param {Function} onProgress - progress callback
 * @param {Function} onMatch - match callback
 * @param {AbortSignal} signal - cancellation signal
 * @returns {Promise<Map<string, object>>} - map of item/recipe name → entry
 */
export async function scanGridVideo(video, settings, onProgress, onMatch, signal) {
  const {
    frameIntervalMs = 33,
    scanMode = 'item',
  } = settings;

  const frameIntervalSec = frameIntervalMs / 1000;
  const duration = video.duration;
  const totalFrames = Math.floor(duration / frameIntervalSec);

  const gridParams = detectGridParams(video.videoWidth, video.videoHeight);
  const dataList = scanMode === 'recipe' ? recipeList : itemList;
  const totalItems = dataList.length;

  // The absolute grid: maps absolute row index → array of tile statuses per column
  // absoluteRow 0 = first row in the collection
  const absoluteGrid = new Map(); // absoluteRow → [{col, status}, ...]

  let cumulativeScrollPx = 0;  // total scroll from start in pixels
  let prevImageData = null;
  let frameCanvas = document.createElement('canvas');
  frameCanvas.width = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d');

  const results = new Map();
  let processedFrames = 0;

  // Helper to yield to browser
  const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

  for (let time = 0; time < duration; time += frameIntervalSec) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    // Seek to frame
    video.currentTime = time;
    await new Promise(resolve => { video.onseeked = resolve; });

    // Draw frame
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    frameCtx.drawImage(video, 0, 0);

    // Get image data for this frame
    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);

    // Estimate scroll from previous frame
    if (prevImageData) {
      const scrollPx = estimateScroll(prevImageData, imageData, gridParams);
      cumulativeScrollPx += scrollPx;
    }

    // Find and classify tiles
    const tiles = findTilesInFrame(imageData, gridParams);
    const classifiedTiles = tiles.map(tile => ({
      ...tile,
      ...classifyTile(imageData, tile),
    }));

    // Map visible rows to absolute rows
    const rowOffsetPx = cumulativeScrollPx;
    const absoluteRowOffset = Math.round(rowOffsetPx / gridParams.tileSpacing);

    const newItems = [];
    for (const tile of classifiedTiles) {
      if (tile.status === 'empty') continue;

      const absRow = absoluteRowOffset + tile.row;
      const absIndex = absRow * gridParams.cols + tile.col;

      // Map to dataset entry
      if (absIndex >= 0 && absIndex < totalItems) {
        const entry = dataList[absIndex];
        const name = entry.name;

        if (!results.has(name)) {
          const result = {
            name,
            type: scanMode,
            category: entry.category || 'Unknown',
            discovered: tile.status === 'discovered',
            gridIndex: absIndex,
          };
          results.set(name, result);
          if (tile.status === 'discovered') {
            newItems.push(result);
          }
        } else {
          // Update if we now see it as discovered
          const existing = results.get(name);
          if (!existing.discovered && tile.status === 'discovered') {
            existing.discovered = true;
            newItems.push(existing);
          }
        }
      }
    }

    if (newItems.length > 0) {
      onMatch({ items: newItems, frameIndex: processedFrames });
      await yieldToBrowser();
    }

    // Store for next scroll estimation
    prevImageData = imageData;
    processedFrames++;

    // Preview
    const previewDataUrl = frameCanvas.toDataURL('image/jpeg', 0.5);
    onProgress({
      phase: 'scanning',
      current: processedFrames,
      total: totalFrames,
      percent: Math.round((processedFrames / totalFrames) * 100),
      message: `Grid scan: ${processedFrames}/${totalFrames} frames | ${results.size} entries mapped (${[...results.values()].filter(r => r.discovered).length} discovered)`,
      currentFrame: previewDataUrl,
      timePosition: time,
      duration,
    });

    // Yield every few frames
    if (processedFrames % 3 === 0) await yieldToBrowser();
  }

  // Clean up
  prevImageData = null;
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
  findTilesInFrame,
  classifyTile,
  estimateScroll,
  scanGridFrame,
  scanGridVideo,
  getGridDataList,
};
