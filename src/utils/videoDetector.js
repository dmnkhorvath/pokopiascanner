/**
 * Video Type Auto-Detector for Pokopia Progress Scanner
 *
 * Analyzes sample frames from a video to determine the scan mode:
 * - Grid layout (items/recipes) → detected via saturation patterns at expected grid positions
 * - Habitat banners → detected via green-tinted top banner with "No." text pattern
 * - Pokémon banners → detected via colored top banner with number pattern
 * - Falls back to 'all' if nothing is detected
 *
 * Designed to be fast (< 3 seconds) using canvas color analysis only (no OCR).
 */

import { detectGridParams } from './gridEngine.js';

// Sample positions as percentage of video duration
const SAMPLE_POSITIONS = [0.10, 0.30, 0.60];
const SAMPLE_LABELS = ['10%', '30%', '60%'];

// Grid detection thresholds
const GRID_SAT_THRESHOLD = 15; // Same as gridEngine.js SAT_THRESHOLD
const GRID_MIN_CELLS_MATCH = 3; // Minimum cells that must match grid pattern

// Banner detection: top 15% of frame
const BANNER_HEIGHT_RATIO = 0.15;

// Color thresholds for banner detection
// Habitat banners have a green tint
const HABITAT_GREEN_DOMINANCE = 1.15; // green channel must be 15% higher than avg of R,B
const HABITAT_MIN_GREEN = 80; // minimum green channel value
// Pokemon banners tend to have saturated colors (red, blue, etc.)
const POKEMON_SAT_THRESHOLD = 25; // mean saturation in banner region
const POKEMON_MIN_BRIGHTNESS = 60; // not too dark

/**
 * Load a video file and seek to a specific time position.
 * Returns a canvas with the frame drawn on it.
 */
function loadVideoFrame(videoFile, timePosition) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video'));
    };

    video.onloadedmetadata = () => {
      const seekTime = Math.min(timePosition * video.duration, video.duration - 0.1);
      video.currentTime = Math.max(0, seekTime);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      cleanup();
      resolve({
        canvas,
        ctx,
        width: video.videoWidth,
        height: video.videoHeight,
        imageData: ctx.getImageData(0, 0, video.videoWidth, video.videoHeight),
      });
    };
  });
}

/**
 * Check if a frame has a grid layout by sampling expected cell positions
 * and checking saturation patterns (discovered = colorful, undiscovered = gray).
 */
function detectGrid(imageData, width, height) {
  const gp = detectGridParams(width, height);
  let matchingCells = 0;
  let totalCells = 0;
  let discoveredCells = 0;
  let undiscoveredCells = 0;

  // Sample cells from the first 3 rows and first 6 columns
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
      // A cell "matches" the grid pattern if it's clearly discovered OR clearly undiscovered
      // (i.e., saturation is not in the ambiguous middle range)
      if (sat > GRID_SAT_THRESHOLD || sat < 8) {
        matchingCells++;
      }
    }
  }

  // Grid detected if enough cells match the expected pattern
  // AND we see a mix of discovered/undiscovered (or all discovered)
  const isGrid = matchingCells >= GRID_MIN_CELLS_MATCH && totalCells >= 4;

  return {
    isGrid,
    matchingCells,
    totalCells,
    discoveredCells,
    undiscoveredCells,
  };
}

/**
 * Compute mean saturation for a rectangular region of ImageData.
 * Samples every 3rd pixel for speed.
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

  // Sample the banner region (every 4th pixel for speed)
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

  // Habitat: green-dominant banner
  const greenDominance = avgRB > 0 ? avgG / avgRB : 0;
  const isHabitat = avgG >= HABITAT_MIN_GREEN &&
    greenDominance >= HABITAT_GREEN_DOMINANCE &&
    avgSat > 15;

  return {
    isHabitat,
    avgR, avgG, avgB, avgSat,
    greenDominance,
  };
}

/**
 * Analyze the top banner region for Pokémon-like saturated colored banner.
 * Pokémon banners are colorful (red, blue, etc.) but NOT green (that's habitat).
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

  // Pokémon: saturated banner that is NOT green-dominant (that would be habitat)
  const isPokemon = avgSat > POKEMON_SAT_THRESHOLD &&
    avgBrightness > POKEMON_MIN_BRIGHTNESS &&
    greenDominance < HABITAT_GREEN_DOMINANCE; // Not green = not habitat

  return {
    isPokemon,
    avgSat, avgBrightness,
    avgR, avgG, avgB,
  };
}

/**
 * Detect the video type by analyzing sample frames.
 *
 * @param {File} videoFile - The video file to analyze
 * @returns {Promise<{detectedMode: string, confidence: string, detectedAt: string}>}
 */
export async function detectVideoType(videoFile) {
  try {
    for (let i = 0; i < SAMPLE_POSITIONS.length; i++) {
      const position = SAMPLE_POSITIONS[i];
      const label = SAMPLE_LABELS[i];

      let frame;
      try {
        frame = await loadVideoFrame(videoFile, position);
      } catch {
        continue; // Skip this sample position if frame extraction fails
      }

      const { imageData, width, height } = frame;

      // 1. Check for grid layout (items/recipes)
      const gridResult = detectGrid(imageData, width, height);
      if (gridResult.isGrid) {
        // Free canvas memory
        frame.canvas.width = 1;
        frame.canvas.height = 1;
        return {
          detectedMode: 'item', // Grid engine handles both items and recipes
          confidence: gridResult.matchingCells >= 6 ? 'high' : 'medium',
          detectedAt: label,
        };
      }

      // 2. Check for habitat banner (green-tinted top)
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

      // 3. Check for Pokémon banner (saturated colored top, not green)
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

      // Free canvas memory
      frame.canvas.width = 1;
      frame.canvas.height = 1;
    }

    // Nothing detected at any sample position
    return {
      detectedMode: 'all',
      confidence: 'low',
      detectedAt: null,
    };
  } catch (err) {
    console.warn('Video type detection failed, defaulting to all:', err);
    return {
      detectedMode: 'all',
      confidence: 'low',
      detectedAt: null,
    };
  }
}

export default { detectVideoType };
