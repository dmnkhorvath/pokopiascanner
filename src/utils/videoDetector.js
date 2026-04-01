/**
 * Video Type Auto-Detector for Pokopia Progress Scanner
 *
 * Analyzes sample frames from a video to determine the scan mode:
 * - Grid layout (items/recipes) → detected via saturation patterns at expected grid positions
 * - Habitat banners → detected via green-tinted top banner
 * - Pokémon banners → detected via colored top banner (not green)
 * - Falls back to 'all' if nothing is detected
 *
 * Designed to be fast (< 5 seconds) using canvas color analysis only (no OCR).
 */

import { detectGridParams } from './gridEngine.js';

// Sample positions as percentage of video duration
const SAMPLE_POSITIONS = [0.10, 0.30, 0.60];
const SAMPLE_LABELS = ['10%', '30%', '60%'];

// Timeouts
const FRAME_TIMEOUT_MS = 5000;   // 5s per frame extraction
const TOTAL_TIMEOUT_MS = 12000;  // 12s total for all detection

// Grid detection thresholds
const GRID_SAT_THRESHOLD = 15;
const GRID_MIN_CELLS_MATCH = 3;

// Banner detection: top 15% of frame
const BANNER_HEIGHT_RATIO = 0.15;

// Color thresholds for banner detection
const HABITAT_GREEN_DOMINANCE = 1.15;
const HABITAT_MIN_GREEN = 80;
const POKEMON_SAT_THRESHOLD = 25;
const POKEMON_MIN_BRIGHTNESS = 60;

/**
 * Wrap a promise with a timeout. Rejects if not resolved within ms.
 */
function withTimeout(promise, ms, label = 'Operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Load a video file and seek to a specific time position.
 * Returns a canvas with the frame drawn on it.
 */
function loadVideoFrame(videoFile, timePosition) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      const url = URL.createObjectURL(videoFile);
      let settled = false;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.onabort = null;
        video.onstalled = null;
        // Don't aggressively reset src — just revoke the blob URL
        video.pause();
      };

      const fail = (msg) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg));
      };

      video.onerror = () => fail('Failed to load video for frame extraction');
      video.onabort = () => fail('Video loading aborted');

      video.onloadedmetadata = () => {
        if (settled) return;
        const duration = video.duration;
        if (!duration || !isFinite(duration) || duration <= 0) {
          fail('Video has no valid duration');
          return;
        }
        const seekTime = Math.min(timePosition * duration, duration - 0.1);
        video.currentTime = Math.max(0, seekTime);
      };

      video.onseeked = () => {
        if (settled) return;
        settled = true;
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) {
            cleanup();
            reject(new Error('Video has no valid dimensions'));
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          cleanup();
          resolve({
            canvas,
            ctx,
            width: w,
            height: h,
            imageData: ctx.getImageData(0, 0, w, h),
          });
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      video.src = url;
    }),
    FRAME_TIMEOUT_MS,
    `Frame extraction at ${Math.round(timePosition * 100)}%`,
  );
}

/**
 * Check if a frame has a grid layout by sampling expected cell positions.
 */
function detectGrid(imageData, width, height) {
  const gp = detectGridParams(width, height);
  let matchingCells = 0;
  let totalCells = 0;
  let discoveredCells = 0;
  let undiscoveredCells = 0;

  const rowsToCheck = Math.min(3, gp.visibleRows);
  const colsToCheck = Math.min(6, gp.cols);

  for (let r = 0; r < rowsToCheck; r++) {
    const cy = gp.row0Y + r * gp.cell;
    const ty = cy - gp.tileHalf;
    if (ty < 0 || cy + gp.tileHalf >= height) continue;

    for (let c = 0; c < colsToCheck; c++) {
      const cx = gp.col0X + c * gp.cell;
      const tx = cx - gp.tileHalf;
      if (tx < 0 || cx + gp.tileHalf >= width) continue;

      const sat = meanSaturationRegion(imageData, tx, ty,
        gp.tileHalf * 2, gp.tileHalf * 2, width);

      totalCells++;
      if (sat > GRID_SAT_THRESHOLD) {
        discoveredCells++;
      } else {
        undiscoveredCells++;
      }
      if (sat > GRID_SAT_THRESHOLD || sat < 8) {
        matchingCells++;
      }
    }
  }

  const isGrid = matchingCells >= GRID_MIN_CELLS_MATCH && totalCells >= 4;

  return { isGrid, matchingCells, totalCells, discoveredCells, undiscoveredCells };
}

/**
 * Compute mean saturation for a rectangular region of ImageData.
 */
function meanSaturationRegion(imageData, x, y, w, h, imgWidth) {
  const { data } = imageData;
  let totalSat = 0;
  let count = 0;
  const x2 = Math.min(x + w, imgWidth);
  const y2 = Math.min(y + h, imageData.height);

  for (let py = y; py < y2; py += 3) {
    for (let px = x; px < x2; px += 3) {
      const idx = (py * imgWidth + px) * 4;
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
 * Analyze the top banner region for habitat-like green tint.
 */
function detectHabitatBanner(imageData, width, height) {
  const bannerH = Math.floor(height * BANNER_HEIGHT_RATIO);
  const { data } = imageData;
  let totalR = 0, totalG = 0, totalB = 0;
  let totalSat = 0;
  let count = 0;

  for (let py = 0; py < bannerH; py += 4) {
    for (let px = 0; px < width; px += 4) {
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      totalR += r;
      totalG += g;
      totalB += b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      totalSat += max === 0 ? 0 : ((max - min) / max) * 100;
      count++;
    }
  }

  if (count === 0) return { isHabitat: false };

  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const avgSat = totalSat / count;
  const avgRB = (avgR + avgB) / 2;
  const greenDominance = avgRB > 0 ? avgG / avgRB : 0;
  const isHabitat = avgG >= HABITAT_MIN_GREEN &&
    greenDominance >= HABITAT_GREEN_DOMINANCE &&
    avgSat > 15;

  return { isHabitat, avgR, avgG, avgB, avgSat, greenDominance };
}

/**
 * Analyze the top banner region for Pokémon-like saturated colored banner.
 */
function detectPokemonBanner(imageData, width, height) {
  const bannerH = Math.floor(height * BANNER_HEIGHT_RATIO);
  const { data } = imageData;
  let totalSat = 0;
  let totalBrightness = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  for (let py = 0; py < bannerH; py += 4) {
    for (let px = 0; px < width; px += 4) {
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      totalR += r;
      totalG += g;
      totalB += b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      totalSat += max === 0 ? 0 : ((max - min) / max) * 100;
      totalBrightness += (r + g + b) / 3;
      count++;
    }
  }

  if (count === 0) return { isPokemon: false };

  const avgSat = totalSat / count;
  const avgBrightness = totalBrightness / count;
  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const avgRB = (avgR + avgB) / 2;
  const greenDominance = avgRB > 0 ? avgG / avgRB : 0;

  const isPokemon = avgSat > POKEMON_SAT_THRESHOLD &&
    avgBrightness > POKEMON_MIN_BRIGHTNESS &&
    greenDominance < HABITAT_GREEN_DOMINANCE;

  return { isPokemon, avgSat, avgBrightness, avgR, avgG, avgB };
}

/**
 * Detect the video type by analyzing sample frames.
 *
 * @param {File} videoFile - The video file to analyze
 * @returns {Promise<{detectedMode: string, confidence: string, detectedAt: string|null}>}
 */
export async function detectVideoType(videoFile) {
  const fallback = { detectedMode: 'all', confidence: 'low', detectedAt: null };

  try {
    // Wrap entire detection in a global timeout
    return await withTimeout(
      (async () => {
        for (let i = 0; i < SAMPLE_POSITIONS.length; i++) {
          const position = SAMPLE_POSITIONS[i];
          const label = SAMPLE_LABELS[i];

          let frame;
          try {
            frame = await loadVideoFrame(videoFile, position);
          } catch (err) {
            console.warn(`Frame extraction at ${label} failed:`, err.message);
            continue; // Skip this sample position
          }

          const { imageData, width, height } = frame;

          // 1. Check for grid layout (items/recipes)
          try {
            const gridResult = detectGrid(imageData, width, height);
            if (gridResult.isGrid) {
              frame.canvas.width = 1;
              frame.canvas.height = 1;
              return {
                detectedMode: 'item',
                confidence: gridResult.matchingCells >= 6 ? 'high' : 'medium',
                detectedAt: label,
              };
            }
          } catch (err) {
            console.warn('Grid detection error:', err.message);
          }

          // 2. Check for habitat banner
          try {
            const habitatResult = detectHabitatBanner(imageData, width, height);
            if (habitatResult.isHabitat) {
              frame.canvas.width = 1;
              frame.canvas.height = 1;
              return {
                detectedMode: 'habitat',
                confidence: habitatResult.greenDominance >= 1.3 ? 'high' : 'medium',
                detectedAt: label,
              };
            }
          } catch (err) {
            console.warn('Habitat detection error:', err.message);
          }

          // 3. Check for Pokémon banner
          try {
            const pokemonResult = detectPokemonBanner(imageData, width, height);
            if (pokemonResult.isPokemon) {
              frame.canvas.width = 1;
              frame.canvas.height = 1;
              return {
                detectedMode: 'pokemon',
                confidence: pokemonResult.avgSat > 40 ? 'high' : 'medium',
                detectedAt: label,
              };
            }
          } catch (err) {
            console.warn('Pokemon detection error:', err.message);
          }

          // Free canvas memory
          frame.canvas.width = 1;
          frame.canvas.height = 1;
        }

        return fallback;
      })(),
      TOTAL_TIMEOUT_MS,
      'Video type detection',
    );
  } catch (err) {
    console.warn('Video type detection failed, defaulting to all:', err.message);
    return fallback;
  }
}

export default { detectVideoType };
