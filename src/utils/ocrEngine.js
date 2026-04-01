/**
 * OCR Engine for Pokopia Progress Scanner
 * Handles video frame extraction, preprocessing, and text recognition.
 */
import { createWorker } from 'tesseract.js';
import { buildFuzzyMatcher } from './fuzzyMatch.js';
import { scanGridVideo, getGridDataList } from './gridEngine.js';
import ocrLookup from '../assets/ocrLookup.json';

// Pre-build the fuzzy matcher once
const matcher = buildFuzzyMatcher(ocrLookup);

// Pre-build habitat number → entry lookup for reliable number-based matching.
// OCR reliably reads "No. XXX" even when the habitat name is garbled.
const habitatByNumber = {};
for (const [name, entry] of Object.entries(ocrLookup)) {
  if (entry.type === 'habitat' && entry.number) {
    habitatByNumber[entry.number] = { ...entry, name };
  }
}

// Pre-build Pokémon number → entry lookup for reliable number-based matching.
// ocrLookup stores Pokémon numbers as '#001' format; we strip the '#' for lookup.
const pokemonByNumber = {};
for (const [name, entry] of Object.entries(ocrLookup)) {
  if (entry.type === 'pokemon' && entry.number) {
    const num = entry.number.replace('#', '');
    pokemonByNumber[num] = { ...entry, name };
  }
}

/**
 * Crop presets for different UI layouts
 */
export const CROP_PRESETS = {
  auto: { x: 0, y: 0, w: 100, h: 100, label: 'Auto (Full Frame)' },
  full: { x: 0, y: 0, w: 100, h: 100, label: 'Full Frame' },
  rightHalf: { x: 50, y: 0, w: 50, h: 100, label: 'Right Half' },
  leftHalf: { x: 0, y: 0, w: 50, h: 100, label: 'Left Half' },
  center: { x: 20, y: 20, w: 60, h: 60, label: 'Center Region' },
  custom: { x: 0, y: 0, w: 100, h: 100, label: 'Custom' },
};


/**
 * Available scan modes - user picks what to scan
 */
export const SCAN_MODES = {
  all: { label: 'All Categories', description: 'Scan for everything' },
  habitat: { label: 'Habitats', description: 'Scan habitat pages (detects built status)' },
  pokemon: { label: 'Pokémon', description: 'Scan Pokémon entries' },
  item: { label: 'Items', description: 'Scan item entries' },
  recipe: { label: 'Recipes', description: 'Scan recipe entries' },
};

/**
 * Default scanner settings
 */
export const DEFAULT_SETTINGS = {
  frameIntervalMs: 0,     // 0 = auto-detect from video FPS
  autoDetectFPS: true,    // Automatically detect video framerate
  processingDelay: 0,     // Delay between OCR processing (0 for max speed)
  cropPreset: 'auto',
  customCrop: { x: 0, y: 0, w: 100, h: 100 },
  confidenceThreshold: 40,
  fuzzyTolerance: 2,
  scanMode: 'all',          // 'all', 'habitat', 'pokemon', 'item', 'recipe'
};

/**
 * Detect the native framerate of a video file using requestVideoFrameCallback.
 * Plays a short segment and measures frame intervals.
 * @param {File} videoFile - The video file to analyze
 * @param {number} sampleDurationMs - How long to sample (default 2000ms)
 * @returns {Promise<{fps: number, frameIntervalMs: number}>}
 */
export async function detectVideoFPS(videoFile, sampleDurationMs = 2000) {
  const FPS_TIMEOUT_MS = 5000; // 5 second timeout for entire FPS detection

  const detect = () => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.onloadedmetadata = null;
      video.oncanplay = null;
      video.onerror = null;
      video.pause();
    };

    const fallback = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ fps: 30, frameIntervalMs: 33, detected: false });
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Failed to load video for FPS detection'));
    };

    video.onloadedmetadata = () => {
      if (settled) return;

      // Fallback if requestVideoFrameCallback is not supported
      if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
        fallback();
        return;
      }

      const frameTimes = [];
      let startTime = null;

      const onFrame = (now, metadata) => {
        if (settled) return;
        if (startTime === null) startTime = now;
        frameTimes.push(metadata.mediaTime);

        if (now - startTime < sampleDurationMs) {
          video.requestVideoFrameCallback(onFrame);
        } else {
          if (settled) return;
          settled = true;
          cleanup();

          if (frameTimes.length < 3) {
            resolve({ fps: 30, frameIntervalMs: 33, detected: false });
            return;
          }

          const intervals = [];
          for (let i = 1; i < frameTimes.length; i++) {
            const diff = frameTimes[i] - frameTimes[i - 1];
            if (diff > 0) intervals.push(diff);
          }

          if (intervals.length === 0) {
            resolve({ fps: 30, frameIntervalMs: 33, detected: false });
            return;
          }

          intervals.sort((a, b) => a - b);
          const medianInterval = intervals[Math.floor(intervals.length / 2)];
          const fps = Math.round(1 / medianInterval);
          const frameIntervalMs = Math.round(medianInterval * 1000);

          resolve({ fps, frameIntervalMs, detected: true });
        }
      };

      video.oncanplay = () => {
        if (settled) return;
        video.requestVideoFrameCallback(onFrame);
        video.play().catch(() => fallback());
      };
    };

    video.src = url;
  });

  // Wrap in timeout so it never hangs
  try {
    return await Promise.race([
      detect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('FPS detection timed out')), FPS_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn('FPS detection failed, using fallback:', err.message);
    return { fps: 30, frameIntervalMs: 33, detected: false };
  }
}

/**
 * Apply median filter to remove artifacts from image data.
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function applyMedianFilter(imageData) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const values = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            values.push(data[((y + dy) * width + (x + dx)) * 4 + c]);
          }
        }
        values.sort((a, b) => a - b);
        output[(y * width + x) * 4 + c] = values[4]; // median
      }
    }
  }

  return new ImageData(output, width, height);
}

/**
 * Convert image data to black and white with threshold.
 * @param {ImageData} imageData
 * @param {number} threshold
 * @returns {ImageData}
 */
function convertToBW(imageData, threshold = 128) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data);

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const bw = gray > threshold ? 255 : 0;
    output[i] = bw;
    output[i + 1] = bw;
    output[i + 2] = bw;
    output[i + 3] = 255;
  }

  return new ImageData(output, width, height);
}

/**
 * Extract green channel from image data and threshold.
 * Optimized for reading white text on purple/colored backgrounds.
 * Purple has low green (~130), white has high green (~253).
 * @param {ImageData} imageData
 * @param {number} threshold - Green channel threshold (default 200)
 * @returns {ImageData}
 */
function extractGreenChannel(imageData, threshold = 200) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const green = data[i + 1];
    const bw = green > threshold ? 255 : 0;
    output[i] = bw;
    output[i + 1] = bw;
    output[i + 2] = bw;
    output[i + 3] = 255;
  }

  return new ImageData(output, width, height);
}

/**
 * Extract and preprocess a frame optimized for white-on-colored-background text.
 * Uses green channel isolation + 3x upscale for better OCR accuracy.
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {Object} cropRegion - { x, y, w, h } in percentages
 * @returns {HTMLCanvasElement}
 */
function extractFrameGreenChannel(video, canvas, cropRegion) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const sx = Math.floor((cropRegion.x / 100) * vw);
  const sy = Math.floor((cropRegion.y / 100) * vh);
  const sw = Math.floor((cropRegion.w / 100) * vw);
  const sh = Math.floor((cropRegion.h / 100) * vh);

  // Draw at original size first to extract pixels
  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  // Extract green channel
  let imageData = ctx.getImageData(0, 0, sw, sh);
  imageData = extractGreenChannel(imageData, 200);
  ctx.putImageData(imageData, 0, 0);

  // Upscale 3x for better OCR on small text
  const upW = sw * 3;
  const upH = sh * 3;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = upW;
  tempCanvas.height = upH;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(canvas, 0, 0, sw, sh, 0, 0, upW, upH);

  // Copy back to main canvas
  canvas.width = upW;
  canvas.height = upH;
  ctx.drawImage(tempCanvas, 0, 0);

  return canvas;
}

/**
 * Extract and preprocess a frame from video at given time.
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {Object} cropRegion - { x, y, w, h } in percentages
 * @returns {HTMLCanvasElement} Processed canvas ready for OCR
 */
function extractFrame(video, canvas, cropRegion) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // Calculate crop in pixels
  const sx = Math.floor((cropRegion.x / 100) * vw);
  const sy = Math.floor((cropRegion.y / 100) * vh);
  const sw = Math.floor((cropRegion.w / 100) * vw);
  const sh = Math.floor((cropRegion.h / 100) * vh);

  canvas.width = sw;
  canvas.height = sh;

  // Draw cropped region
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  // Apply median filter
  let imageData = ctx.getImageData(0, 0, sw, sh);
  imageData = applyMedianFilter(imageData);

  // Convert to B&W
  imageData = convertToBW(imageData);

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}


// ─── Frame deduplication helpers ───────────────────────────────────────────

/**
 * Compute a fast perceptual hash of a video frame's crop region.
 * Samples a sparse grid of pixels (8x8 = 64 samples) and produces a
 * 64-bit hash string. Identical or near-identical frames produce the
 * same hash, allowing us to skip redundant OCR.
 *
 * @param {HTMLVideoElement} video
 * @param {Object} cropRegion - { x, y, w, h } in percentages
 * @returns {string} 16-char hex hash
 */
function computeFrameHash(video, cropRegion) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const sx = Math.floor((cropRegion.x / 100) * vw);
  const sy = Math.floor((cropRegion.y / 100) * vh);
  const sw = Math.floor((cropRegion.w / 100) * vw);
  const sh = Math.floor((cropRegion.h / 100) * vh);

  // Draw small 8x8 thumbnail of the crop region for hashing
  canvas.width = 8;
  canvas.height = 8;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 8, 8);
  const imageData = ctx.getImageData(0, 0, 8, 8);
  const data = imageData.data;

  // Compute average brightness
  let totalGray = 0;
  const grays = [];
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    grays.push(gray);
    totalGray += gray;
  }
  const avgGray = totalGray / grays.length;

  // Build 64-bit hash: each bit = 1 if pixel > average, 0 otherwise
  let hash = '';
  for (let i = 0; i < grays.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4 && (i + j) < grays.length; j++) {
      if (grays[i + j] >= avgGray) nibble |= (1 << j);
    }
    hash += nibble.toString(16);
  }

  // Free canvas
  canvas.width = 0;
  canvas.height = 0;
  return hash;
}

/**
 * Quick pixel comparison between current video frame and a reference canvas.
 * Samples a sparse set of pixels from the crop region and returns true if
 * the frames are nearly identical (< threshold% difference).
 *
 * @param {HTMLVideoElement} video
 * @param {Uint8ClampedArray|null} prevSamples - Previous frame's sample data
 * @param {Object} cropRegion - { x, y, w, h } in percentages
 * @param {number} diffThreshold - Max fraction of different samples (0.05 = 5%)
 * @returns {{ similar: boolean, samples: Uint8ClampedArray }}
 */
function quickFrameCompare(video, prevSamples, cropRegion, diffThreshold = 0.05, resolution = 16, pixelTolerance = 30) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const sx = Math.floor((cropRegion.x / 100) * vw);
  const sy = Math.floor((cropRegion.y / 100) * vh);
  const sw = Math.floor((cropRegion.w / 100) * vw);
  const sh = Math.floor((cropRegion.h / 100) * vh);

  // Draw thumbnail at the requested resolution for comparison.
  // Higher resolution catches subtler changes (e.g. habitat number digits).
  canvas.width = resolution;
  canvas.height = resolution;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, resolution, resolution);
  const imageData = ctx.getImageData(0, 0, resolution, resolution);
  const samples = imageData.data; // resolution*resolution*4 bytes

  canvas.width = 0;
  canvas.height = 0;

  if (!prevSamples) {
    return { similar: false, samples: new Uint8ClampedArray(samples) };
  }

  // Compare pixel-by-pixel with per-channel tolerance
  const pixelCount = resolution * resolution;
  let diffCount = 0;

  for (let i = 0; i < samples.length; i += 4) {
    const dr = Math.abs(samples[i] - prevSamples[i]);
    const dg = Math.abs(samples[i + 1] - prevSamples[i + 1]);
    const db = Math.abs(samples[i + 2] - prevSamples[i + 2]);
    if (dr > pixelTolerance || dg > pixelTolerance || db > pixelTolerance) {
      diffCount++;
    }
  }

  const diffRatio = diffCount / pixelCount;
  return {
    similar: diffRatio < diffThreshold,
    samples: new Uint8ClampedArray(samples),
  };
}


/**
 * Habitat-specific frame analysis using number-based matching.
 *
 * Primary strategy: extract "No. XXX" from the upper banner OCR text and
 * look up the habitat by number. This is far more reliable than fuzzy name
 * matching because Tesseract consistently reads digits even when the white-
 * on-purple habitat name is garbled.
 *
 * Fallback: if no number is found, try fuzzy name matching on individual lines.
 *
 * @param {string} fullText - Bottom-half OCR text (for discovery status check)
 * @param {string} upperText - Upper banner OCR text (for number extraction)
 * @param {number} fuzzyTolerance - Max Levenshtein distance (fallback only)
 * @returns {Object|null} { name, number, type, built } or null
 */
export function matchHabitatFrame(fullText, upperText, fuzzyTolerance = 2) {
  // Flatten upper text into one string for regex search
  const flatUpper = upperText.replace(/\n/g, ' ');

  // Primary: extract "No. XXX" and look up by number
  const noMatch = flatUpper.match(/No\.?\s*(\d{1,3})/i);
  if (noMatch) {
    const habitatNumber = noMatch[1].padStart(3, '0');
    const entry = habitatByNumber[habitatNumber];
    if (entry) {
      return {
        name: entry.name,
        number: entry.number,
        type: 'habitat',
        category: entry.category || null,
        built: !isUndiscovered(fullText),
      };
    }
  }

  // Fallback: try fuzzy name matching on individual lines
  const lines = upperText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  for (const line of lines) {
    if (/No\.?\s*\d/i.test(line)) continue; // skip number lines
    const result = matcher.findMatch(line, fuzzyTolerance);
    if (result && result.type === 'habitat') {
      return {
        ...result,
        built: !isUndiscovered(fullText),
      };
    }
  }

  return null;
}

/**
 * Pokémon-specific frame analysis using number-based matching.
 *
 * Primary strategy: extract "No. XXX" from the banner OCR text and
 * look up the Pokémon by number. Works across all banner colors because
 * raw 3× upscaled crops preserve white text on any colored banner.
 *
 * Captured vs sensed: "???" in the game OCRs as "PPP", repeated chars,
 * or question marks. If the name line matches such a pattern, the Pokémon
 * is marked as sensed.
 *
 * @param {string} bannerText - Banner OCR text (number + name area)
 * @param {number} fuzzyTolerance - Max Levenshtein distance (fallback only)
 * @returns {Object|null} { name, number, type, captured } or null
 */
export function matchPokemonFrame(bannerText, fuzzyTolerance = 2) {
  const flatText = bannerText.replace(/\n/g, ' ');

  // Primary: extract "No. XXX" and look up by number
  const noMatch = flatText.match(/No\.?\s*(\d{1,3})/i);
  if (noMatch) {
    const pokemonNumber = noMatch[1].padStart(3, '0');
    const entry = pokemonByNumber[pokemonNumber];
    if (entry) {
      // Determine captured status from the name portion of the banner
      const captured = !isSensedPokemon(bannerText, noMatch[0]);
      return {
        name: entry.name,
        number: entry.number,
        type: 'pokemon',
        captured,
      };
    }
  }

  // Fallback: try fuzzy name matching on individual lines
  const lines = bannerText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  for (const line of lines) {
    if (/No\.?\s*\d/i.test(line)) continue; // skip number lines
    const result = matcher.findMatch(line, fuzzyTolerance);
    if (result && result.type === 'pokemon') {
      return {
        ...result,
        captured: true, // if fuzzy matched a real name, it's captured
      };
    }
  }

  return null;
}

/**
 * Check if the banner text indicates a sensed Pokémon.
 * In-game, sensed Pokémon show "???" as their name, which Tesseract
 * reads as "PPP", "???", "PRP", or similar repeated-character patterns.
 * @param {string} bannerText - Full banner OCR text
 * @param {string} numberMatch - The matched "No. XXX" string to exclude
 * @returns {boolean}
 */
function isSensedPokemon(bannerText, numberMatch) {
  // Get the text after the number line (the name portion)
  const lines = bannerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nameLines = lines.filter(l => !l.includes(numberMatch) && !/^No\.?\s*\d/i.test(l));

  if (nameLines.length === 0) return true; // no name visible = sensed

  for (const line of nameLines) {
    const cleaned = line.replace(/[\s.,:;!]/g, '');
    if (cleaned.length === 0) continue;

    // Check for ??? patterns (direct or OCR variants)
    if (/^[?]{2,}$/.test(cleaned)) return true;
    // PPP, PRP, and similar repeated-char OCR artifacts from ???
    if (/^[P?Rr]{2,}$/.test(cleaned)) return true;
    // Very short gibberish that doesn't match any real name
    if (cleaned.length <= 3 && /^[^a-zA-Z]*$/.test(cleaned)) return true;
  }

  return false;
}

/**
 * Check if the frame text indicates an undiscovered habitat.
 * @param {string} text - Full frame OCR text
 * @returns {boolean}
 */
function isUndiscovered(text) {
  const lower = text.toLowerCase();
  // Check for the exact phrase and common OCR variations
  return lower.includes("haven't discovered this habitat") ||
         lower.includes("havent discovered this habitat") ||
         lower.includes("haven\u2019t discovered this habitat") ||
         lower.includes("not discovered this habitat") ||
         lower.includes("haven\'t discovered this habitat");
}

/**
 * Match OCR text lines against the lookup dictionary.
 * @param {string} text - Raw OCR output text
 * @param {number} fuzzyTolerance - Max Levenshtein distance
 * @returns {Array<Object>} Matched items
 */
export function matchText(text, fuzzyTolerance = 2) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const matches = [];
  const seen = new Set();

  for (const line of lines) {
    // Try matching the full line
    const result = matcher.findMatch(line, fuzzyTolerance);
    if (result && !seen.has(result.name)) {
      seen.add(result.name);
      matches.push(result);
      continue;
    }

    // Try splitting by common separators and matching parts
    const parts = line.split(/[,;|/]/).map(p => p.trim()).filter(p => p.length > 1);
    for (const part of parts) {
      const partResult = matcher.findMatch(part, fuzzyTolerance);
      if (partResult && !seen.has(partResult.name)) {
        seen.add(partResult.name);
        matches.push(partResult);
      }
    }
  }

  return matches;
}

/**
 * Create and run the OCR scanning pipeline.
 * @param {File} videoFile - The video file to scan
 * @param {Object} settings - Scanner settings
 * @param {Function} onProgress - Progress callback ({ phase, current, total, percent, currentFrame })
 * @param {Function} onMatch - Called when new items are found ({ items, frameIndex })
 * @param {AbortSignal} signal - AbortController signal to cancel scanning
 * @returns {Promise<Object>} Final scan results
 */
/**
 * Create a pool of Tesseract workers for parallel OCR.
 * Accepts optional Tesseract parameters for speed optimization.
 * @param {number} poolSize - Number of workers to create
 * @param {Object} [ocrParams] - Optional Tesseract parameters (whitelist, PSM, etc.)
 * @returns {Promise<Array>} Array of initialized Tesseract workers
 */
async function createWorkerPool(poolSize, ocrParams = null) {
  const workers = await Promise.all(
    Array.from({ length: poolSize }, async () => {
      const w = await createWorker('eng', 1, { logger: () => {} });
      if (ocrParams) {
        await w.setParameters(ocrParams);
      }
      return w;
    })
  );
  return workers;
}

/**
 * Terminate all workers in the pool.
 * @param {Array} workers
 */
async function terminateWorkerPool(workers) {
  await Promise.all(workers.map(w => w.terminate()));
}

/**
 * Detect if running on a mobile device.
 * @returns {boolean}
 */
function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Extract a preprocessed frame from video into a standalone canvas.
 * @param {HTMLVideoElement} video
 * @param {Object} cropRegion - { x, y, w, h } in percentages
 * @param {string} mode - 'standard' or 'green' or 'brightness'
 * @returns {HTMLCanvasElement}
 */
function extractFrameToCanvas(video, cropRegion, mode = 'standard') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const sx = Math.floor((cropRegion.x / 100) * vw);
  const sy = Math.floor((cropRegion.y / 100) * vh);
  const sw = Math.floor((cropRegion.w / 100) * vw);
  const sh = Math.floor((cropRegion.h / 100) * vh);

  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  if (mode === 'green') {
    let imageData = ctx.getImageData(0, 0, sw, sh);
    imageData = extractGreenChannel(imageData, 200);
    ctx.putImageData(imageData, 0, 0);

    // Upscale 3x for better OCR on small text
    const upW = sw * 3;
    const upH = sh * 3;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = upW;
    tempCanvas.height = upH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(canvas, 0, 0, sw, sh, 0, 0, upW, upH);
    canvas.width = upW;
    canvas.height = upH;
    ctx.drawImage(tempCanvas, 0, 0);
  } else if (mode === 'brightness') {
    // Grayscale threshold >200 — works for white text on ANY colored banner.
    // Used for Pokémon banners where colors vary per type.
    let imageData = ctx.getImageData(0, 0, sw, sh);
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const bw = gray > 200 ? 255 : 0;
      output[i] = bw;
      output[i + 1] = bw;
      output[i + 2] = bw;
      output[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(output, width, height), 0, 0);

    // Upscale 3x for better OCR on small text
    const upW = sw * 3;
    const upH = sh * 3;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = upW;
    tempCanvas.height = upH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(canvas, 0, 0, sw, sh, 0, 0, upW, upH);
    canvas.width = upW;
    canvas.height = upH;
    ctx.drawImage(tempCanvas, 0, 0);
  } else if (mode === 'raw') {
    // Raw mode: no thresholding, just crop + 3x upscale.
    // Testing proved that raw banner crops produce far better OCR than
    // brightness or green-channel thresholding which destroy the text.
    const rawUpW = sw * 3;
    const rawUpH = sh * 3;
    const rawTemp = document.createElement('canvas');
    rawTemp.width = rawUpW;
    rawTemp.height = rawUpH;
    const rawCtx = rawTemp.getContext('2d');
    rawCtx.imageSmoothingEnabled = false;
    rawCtx.drawImage(canvas, 0, 0, sw, sh, 0, 0, rawUpW, rawUpH);
    canvas.width = rawUpW;
    canvas.height = rawUpH;
    ctx.drawImage(rawTemp, 0, 0);
  } else {
    let imageData = ctx.getImageData(0, 0, sw, sh);
    imageData = applyMedianFilter(imageData);
    imageData = convertToBW(imageData);
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

/**
 * Free canvas memory.
 * @param {HTMLCanvasElement} canvas
 */
function freeCanvas(canvas) {
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Yield to the browser's event loop so React can flush state updates and repaint.
 * Without this, rapid async callbacks inside Promise.all starve the render loop.
 */
function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Robust video seeking: uses addEventListener with { once: true } and a
 * timeout fallback so the scan never hangs if the 'seeked' event doesn't fire
 * (common on mobile Safari).
 */
function seekVideo(video, time, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener('seeked', () => {
      clearTimeout(timer);
      done();
    }, { once: true });
    video.currentTime = time;
  });
}


/**
 * Get the primary crop region used for deduplication hashing per scan mode.
 * This is the region most likely to change between different content pages.
 */
function getDeduplicationCrop(scanMode) {
  if (scanMode === 'habitat') {
    // Habitat number region in the upper banner
    return { x: 30, y: 0, w: 40, h: 12 };
  } else if (scanMode === 'pokemon') {
    // Pokemon banner region
    return { x: 20, y: 0, w: 35, h: 12 };
  } else {
    // Full frame for generic mode
    return { x: 0, y: 0, w: 100, h: 100 };
  }
}

/**
 * Get optimized Tesseract parameters per scan mode.
 * For number-heavy modes (pokemon, habitat), restrict character whitelist
 * and use single-line page segmentation for dramatic speed improvement.
 */
function getOcrParams(scanMode) {
  if (scanMode === 'pokemon' || scanMode === 'habitat') {
    // PSM 6 (uniform block) reads multi-line banners ("No. XXX" + name) reliably.
    // No whitelist: testing proved raw OCR without character restrictions produces
    // far better results than the previous whitelist + PSM 7 approach.
    return {
      tessedit_pageseg_mode: '6', // PSM 6 = uniform block of text
    };
  }
  // Generic mode: no restrictions
  return null;
}

/**
 * Get optimized Tesseract parameters for the "full text" worker
 * used in habitat mode for the bottom half (discovery status check).
 * This needs to read full English text, not just numbers.
 */
function getFullTextOcrParams() {
  return {
    tessedit_pageseg_mode: '6', // PSM 6 = uniform block of text
  };
}


/**
 * Create and run the OCR scanning pipeline with parallel worker pool.
 * Uses batched processing to keep memory bounded (mobile-safe).
 *
 * Optimizations over baseline:
 * - Frame deduplication via perceptual hash (skip identical frames)
 * - Quick pixel comparison to skip unchanged frames before canvas creation
 * - Smaller crop regions focused on number areas for pokemon/habitat
 * - Tesseract char whitelist + PSM optimization for number-heavy modes
 * - Immediate preview frame sent before OCR starts (fixes black preview)
 *
 * @param {File} videoFile - The video file to scan
 * @param {Object} settings - Scanner settings
 * @param {Function} onProgress - Progress callback
 * @param {Function} onMatch - Called when new items are found
 * @param {AbortSignal} signal - AbortController signal to cancel scanning
 * @returns {Promise<Object>} Final scan results
 */
export async function scanVideo(videoFile, settings, onProgress, onMatch, signal) {
  let {
    frameIntervalMs = 0,
    autoDetectFPS = true,
    processingDelay = 0,
    cropPreset = 'auto',
    customCrop = { x: 0, y: 0, w: 100, h: 100 },
    confidenceThreshold = 40,
    fuzzyTolerance = 2,
    scanMode = 'all',
  } = settings;

  const cropRegion = cropPreset === 'custom'
    ? customCrop
    : CROP_PRESETS[cropPreset] || CROP_PRESETS.auto;

  const results = {
    pokemon: new Map(),
    item: new Map(),
    habitat: new Map(),
    recipe: new Map(),
  };

  // Create video element
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  const videoUrl = URL.createObjectURL(videoFile);
  video.src = videoUrl;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const duration = video.duration;

  // ─── Grid-based scanning for item/recipe modes ───────────────────────────
  // Items and recipes appear in a scrolling grid without text labels.
  // Instead of OCR, we use canvas pixel analysis to detect the grid layout,
  // classify tiles as discovered/undiscovered, and track scroll position.
  if (scanMode === 'item' || scanMode === 'recipe') {
    // Auto-detect FPS first
    if (autoDetectFPS && frameIntervalMs === 0) {
      onProgress({
        phase: 'detecting', current: 0, total: 0, percent: 0,
        message: 'Detecting video framerate...',
      });
      try {
        const fpsInfo = await detectVideoFPS(videoFile);
        frameIntervalMs = fpsInfo.frameIntervalMs;
      } catch {
        frameIntervalMs = 33;
      }
    }

    onProgress({
      phase: 'init', current: 0, total: 0, percent: 0,
      message: `Starting grid-based ${scanMode} scan...`,
    });

    const gridResults = await scanGridVideo(video, {
      ...settings,
      frameIntervalMs,
      scanMode,
    }, onProgress, onMatch, signal);

    // Convert grid results to standard format
    const dataList = getGridDataList(scanMode);
    const categoryKey = scanMode === 'recipe' ? 'recipe' : 'item';
    for (const [name, entry] of gridResults) {
      results[categoryKey].set(name, entry);
    }

    // Build final results and return
    URL.revokeObjectURL(videoUrl);
    const mobile = isMobileDevice();
    const discovered = [...gridResults.values()].filter(r => r.discovered).length;
    const undiscovered = [...gridResults.values()].filter(r => !r.discovered).length;

    const finalResults = {
      scanDate: new Date().toISOString(),
      totalFound: gridResults.size,
      pokemon: { found: results.pokemon.size, total: 300, items: Array.from(results.pokemon.values()) },
      items: { found: results.item.size, total: 1254, items: Array.from(results.item.values()) },
      habitats: { found: results.habitat.size, total: 209, items: Array.from(results.habitat.values()) },
      recipes: { found: results.recipe.size, total: 743, items: Array.from(results.recipe.values()) },
    };
    finalResults.totalFound = finalResults.pokemon.found + finalResults.items.found + finalResults.habitats.found + finalResults.recipes.found;

    onProgress({
      phase: 'complete',
      current: 1, total: 1, percent: 100,
      message: `Grid scan complete! Mapped ${gridResults.size} ${scanMode}s (${discovered} discovered, ${undiscovered} undiscovered).`,
    });

    return finalResults;
  }




  // Auto-detect FPS
  if (autoDetectFPS && frameIntervalMs === 0) {
    onProgress({
      phase: 'detecting', current: 0, total: 0, percent: 0,
      message: 'Detecting video framerate...',
    });
    try {
      const fpsInfo = await detectVideoFPS(videoFile);
      frameIntervalMs = fpsInfo.frameIntervalMs;
      onProgress({
        phase: 'detecting', current: 0, total: 0, percent: 0,
        message: fpsInfo.detected
          ? `Detected ${fpsInfo.fps} FPS (${fpsInfo.frameIntervalMs}ms per frame)`
          : `Could not detect FPS, using fallback ${fpsInfo.fps} FPS`,
      });
    } catch {
      frameIntervalMs = 33;
    }
  }

  const frameIntervalSec = frameIntervalMs / 1000;
  const framesToProcess = Math.floor(duration / frameIntervalSec);

  // Determine worker pool size — smaller on mobile to save memory
  const mobile = isMobileDevice();
  const maxWorkers = mobile ? 4 : 8;
  const poolSize = Math.min(
    navigator.hardwareConcurrency || 4,
    maxWorkers,
    Math.max(1, Math.floor(framesToProcess / 2))
  );

  // Batch size: how many frames to extract before OCR-ing them
  // Keeps memory bounded — especially important on iOS Safari
  const batchSize = poolSize * 4;

  // Get optimized Tesseract parameters for this scan mode
  const ocrParams = getOcrParams(scanMode);

  onProgress({
    phase: 'init', current: 0, total: framesToProcess, percent: 0,
    message: `Initializing ${poolSize} parallel OCR workers${mobile ? ' (mobile mode)' : ''}... (${framesToProcess} frames at ${frameIntervalMs}ms intervals)`,
  });

  // Create primary worker pool with mode-specific optimizations
  const workers = await createWorkerPool(poolSize, ocrParams);

  // For habitat mode, we also need a "full text" worker for the bottom half
  // that reads English text (discovery status). Use a separate small pool.
  let fullTextWorkers = null;
  if (scanMode === 'habitat') {
    const ftPoolSize = Math.max(1, Math.floor(poolSize / 2));
    fullTextWorkers = await createWorkerPool(ftPoolSize, getFullTextOcrParams());
  }

  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');

  let processedCount = 0;
  let skippedCount = 0;

  // Deduplication state — mode-aware.
  // Habitat mode: pixel dedup DISABLED because consecutive habitat pages can
  // look nearly identical (differ by one small item/decoration). The results
  // Map already prevents duplicate entries, so the only cost is extra OCR calls
  // which are fast (just reading a number from the banner).
  // Pokemon/default: pixel dedup enabled with mode-appropriate settings.
  const enableDedup = scanMode !== 'habitat';
  const dedupCrop = getDeduplicationCrop(scanMode);
  const dedupDiffThreshold = scanMode === 'pokemon' ? 0.03 : 0.05;
  const dedupResolution   = scanMode === 'pokemon' ? 32   : 16;
  const dedupPixelTol     = scanMode === 'pokemon' ? 20   : 30;
  let prevFrameHash = null;
  let prevFrameSamples = null;

  // Track whether we've sent the first preview
  let firstPreviewSent = false;

  /**
   * Process a single job with a given worker (and optional full-text worker).
   */
  async function processJob(job, worker, ftWorker) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    if (scanMode === 'habitat') {
      // Use optimized number worker for upper banner
      const { data: upperData } = await worker.recognize(job.canvases.upper);
      // Use full-text worker for bottom half (discovery status)
      const ftW = ftWorker || worker;
      const { data: fullData } = await ftW.recognize(job.canvases.bottom);

      if (upperData.confidence >= confidenceThreshold && upperData.text.trim()) {
        const habitat = matchHabitatFrame(fullData.text, upperData.text, fuzzyTolerance);
        if (habitat && !results.habitat.has(habitat.name)) {
          results.habitat.set(habitat.name, habitat);
          onMatch({ items: [habitat], frameIndex: job.index });
          await yieldToBrowser();
        } else if (habitat && results.habitat.has(habitat.name)) {
          const existing = results.habitat.get(habitat.name);
          if (!existing.built && habitat.built) {
            results.habitat.set(habitat.name, habitat);
          }
        }
      }
    } else if (scanMode === 'pokemon') {
      const { data: bannerData } = await worker.recognize(job.canvases.banner);

      if (bannerData.confidence >= confidenceThreshold && bannerData.text.trim()) {
        const pokemon = matchPokemonFrame(bannerData.text, fuzzyTolerance);
        if (pokemon && !results.pokemon.has(pokemon.name)) {
          results.pokemon.set(pokemon.name, pokemon);
          onMatch({ items: [pokemon], frameIndex: job.index });
          await yieldToBrowser();
        } else if (pokemon && results.pokemon.has(pokemon.name)) {
          // Update captured status if we see a captured version later
          const existing = results.pokemon.get(pokemon.name);
          if (!existing.captured && pokemon.captured) {
            results.pokemon.set(pokemon.name, pokemon);
          }
        }
      }
    } else {
      const { data } = await worker.recognize(job.canvases.full);

      if (data.confidence >= confidenceThreshold && data.text.trim()) {
        const matches = matchText(data.text, fuzzyTolerance);
        const newItems = [];
        for (const match of matches) {
          const type = match.type;
          if (scanMode !== 'all' && type !== scanMode) continue;
          if (results[type] && !results[type].has(match.name)) {
            results[type].set(match.name, match);
            newItems.push(match);
          }
        }
        if (newItems.length > 0) {
          onMatch({ items: newItems, frameIndex: job.index });
          await yieldToBrowser();
        }
      }
    }

    // Free canvas memory immediately
    Object.values(job.canvases).forEach(freeCanvas);
    job.canvases = null;

    processedCount++;
    const totalAccountedFor = processedCount + skippedCount;
    onProgress({
      phase: 'scanning',
      current: totalAccountedFor,
      total: framesToProcess,
      percent: Math.round((totalAccountedFor / framesToProcess) * 100),
      message: `Scanning: ${totalAccountedFor}/${framesToProcess} (${skippedCount} skipped, ${poolSize} workers${mobile ? ', mobile' : ''})`,
      currentFrame: job.previewDataUrl,
      timePosition: job.time,
      duration,
    });
    // Yield to browser so React can repaint progress/matches
    await yieldToBrowser();
  }

  /**
   * Process a batch of jobs in parallel across the worker pool.
   */
  async function processBatch(batch) {
    // Distribute jobs round-robin across workers
    const queues = workers.map(() => []);
    batch.forEach((job, i) => queues[i % poolSize].push(job));

    await Promise.all(
      queues.map(async (queue, wIdx) => {
        for (const job of queue) {
          if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
          // Pass full-text worker for habitat mode (round-robin from ftWorkers pool)
          const ftW = fullTextWorkers ? fullTextWorkers[wIdx % fullTextWorkers.length] : null;
          await processJob(job, workers[wIdx], ftW);
          if (processingDelay > 0) {
            await new Promise(r => setTimeout(r, processingDelay));
          }
        }
      })
    );
  }

  try {
    // Process frames in memory-bounded batches:
    // Extract a batch of frames → OCR them in parallel → free memory → repeat
    let batch = [];
    let frameIdx = 0;

    for (let time = 0; time < duration; time += frameIntervalSec) {
      if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

      // FIX: Seek to 0.1s for the first frame to avoid black frame from undecoded video
      const seekTime = (time === 0) ? 0.1 : time;
      await seekVideo(video, seekTime);

      // ─── Quick frame comparison (Optimization D) ─────────────────────
      // Before creating any canvases, compare a small pixel sample to the
      // previous frame. If nearly identical, skip entirely.
      const { similar, samples: currentSamples } = quickFrameCompare(
        video, prevFrameSamples, dedupCrop, dedupDiffThreshold, dedupResolution, dedupPixelTol
      );

      if (enableDedup && similar && prevFrameHash !== null) {
        // Frame is nearly identical to previous — skip OCR entirely
        skippedCount++;
        frameIdx++;

        // Still update progress so the UI doesn't appear stuck
        if (skippedCount % 10 === 0) {
          const totalAccountedFor = processedCount + skippedCount;
          onProgress({
            phase: 'scanning',
            current: totalAccountedFor,
            total: framesToProcess,
            percent: Math.round((totalAccountedFor / framesToProcess) * 100),
            message: `Scanning: ${totalAccountedFor}/${framesToProcess} (${skippedCount} skipped, ${poolSize} workers${mobile ? ', mobile' : ''})`,
            timePosition: seekTime,
            duration,
          });
          await yieldToBrowser();
        }
        continue;
      }
      prevFrameSamples = currentSamples;

      // ─── Frame deduplication via perceptual hash (Optimization A) ────
      const frameHash = computeFrameHash(video, dedupCrop);
      if (enableDedup && scanMode !== 'habitat' && frameHash === prevFrameHash) {
        // Identical hash — skip this frame
        skippedCount++;
        frameIdx++;
        continue;
      }
      prevFrameHash = frameHash;

      // ─── Generate preview ────────────────────────────────────────────
      previewCanvas.width = video.videoWidth;
      previewCanvas.height = video.videoHeight;
      previewCtx.drawImage(video, 0, 0);
      const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.5);

      // FIX: Send first preview immediately BEFORE any OCR starts
      if (!firstPreviewSent) {
        firstPreviewSent = true;
        onProgress({
          phase: 'scanning',
          current: 0,
          total: framesToProcess,
          percent: 0,
          message: `Starting scan... (${poolSize} workers${mobile ? ', mobile' : ''})`,
          currentFrame: previewDataUrl,
          timePosition: seekTime,
          duration,
        });
        await yieldToBrowser();
      }

      // ─── Extract preprocessed canvases ───────────────────────────────
      const job = { index: frameIdx, time: seekTime, previewDataUrl, canvases: {} };

      if (scanMode === 'habitat') {
        // Optimization B: Tighter crop for number region "No. XXX"
        // Number appears in center of upper banner
        const upperCrop = { x: 30, y: 0, w: 40, h: 12 };
        job.canvases.upper = extractFrameToCanvas(video, upperCrop, 'raw');
        const bottomCrop = { x: cropRegion.x, y: 50, w: cropRegion.w, h: 50 };
        job.canvases.bottom = extractFrameToCanvas(video, bottomCrop, 'standard');
      } else if (scanMode === 'pokemon') {
        // Optimization B: Tighter crop for number region
        // The "No. XXX" + name appears in center banner: 20-55% width, 0-12% height
        const bannerCrop = { x: 20, y: 0, w: 35, h: 12 };
        job.canvases.banner = extractFrameToCanvas(video, bannerCrop, 'raw');
      } else {
        job.canvases.full = extractFrameToCanvas(video, cropRegion, 'standard');
      }

      batch.push(job);
      frameIdx++;

      // Yield periodically during extraction so UI stays responsive
      if (frameIdx % 4 === 0) await yieldToBrowser();

      // When batch is full, process it and free memory
      if (batch.length >= batchSize) {
        await processBatch(batch);
        batch = [];
      }
    }

    // Process remaining frames
    if (batch.length > 0) {
      await processBatch(batch);
      batch = [];
    }

  } finally {
    await terminateWorkerPool(workers);
    if (fullTextWorkers) {
      await terminateWorkerPool(fullTextWorkers);
    }
    URL.revokeObjectURL(videoUrl);
    freeCanvas(previewCanvas);
  }

  // Build final results
  const finalResults = {
    scanDate: new Date().toISOString(),
    totalFound: 0,
    pokemon: {
      found: results.pokemon.size,
      total: 300,
      items: Array.from(results.pokemon.values()),
    },
    items: {
      found: results.item.size,
      total: 1254,
      items: Array.from(results.item.values()),
    },
    habitats: {
      found: results.habitat.size,
      total: 209,
      items: Array.from(results.habitat.values()),
    },
    recipes: {
      found: results.recipe.size,
      total: 743,
      items: Array.from(results.recipe.values()),
    },
  };

  finalResults.totalFound =
    finalResults.pokemon.found +
    finalResults.items.found +
    finalResults.habitats.found +
    finalResults.recipes.found;

  onProgress({
    phase: 'complete',
    current: framesToProcess,
    total: framesToProcess,
    percent: 100,
    message: scanMode === 'habitat'
      ? `Scan complete! Found ${finalResults.habitats.found} habitats (${finalResults.habitats.items.filter(h => h.built).length} built, ${finalResults.habitats.items.filter(h => !h.built).length} not built). ${skippedCount} frames skipped. ${poolSize} workers${mobile ? ' (mobile)' : ''}.`
      : scanMode === 'pokemon'
      ? `Scan complete! Found ${finalResults.pokemon.found} Pokémon (${finalResults.pokemon.items.filter(p => p.captured).length} captured, ${finalResults.pokemon.items.filter(p => !p.captured).length} sensed). ${skippedCount} frames skipped. ${poolSize} workers${mobile ? ' (mobile)' : ''}.`
      : `Scan complete! Found ${finalResults.totalFound} items. ${skippedCount} frames skipped. ${poolSize} workers${mobile ? ' (mobile)' : ''}.`,
  });

  return finalResults;
}

export function getCategoryTotals() {
  return {
    pokemon: 300,
    items: 1254,
    habitats: 209,
    recipes: 743,
  };
}

/**
 * Merge two scan results together
 * @param {Object} existing - Previous scan results
 * @param {Object} incoming - New scan results
 * @returns {Object} Merged results
 */
export function mergeResults(existing, incoming) {
  const merged = {
    scanDate: new Date().toISOString(),
    totalFound: 0,
    pokemon: mergeCategory(existing?.pokemon, incoming?.pokemon, 300),
    items: mergeCategory(existing?.items, incoming?.items, 1254),
    habitats: mergeCategory(existing?.habitats, incoming?.habitats, 209),
    recipes: mergeCategory(existing?.recipes, incoming?.recipes, 743),
  };

  merged.totalFound =
    merged.pokemon.found +
    merged.items.found +
    merged.habitats.found +
    merged.recipes.found;

  return merged;
}

function mergeCategory(existing, incoming, total) {
  const itemMap = new Map();

  const addItems = (arr) => {
    if (!arr) return;
    for (const item of arr) {
      const obj = typeof item === 'string' ? { name: item } : item;
      const name = obj.name;
      if (!name) continue;

      if (itemMap.has(name)) {
        // Merge: upgrade statuses (true wins over false/null)
        const prev = itemMap.get(name);
        if (obj.built === true) prev.built = true;
        if (obj.captured === true) prev.captured = true;
        if (obj.discovered === true) prev.discovered = true;
        // Keep number/category if missing
        if (obj.number && !prev.number) prev.number = obj.number;
        if (obj.category && !prev.category) prev.category = obj.category;
        // Keep confidence if higher
        if (obj.confidence != null && (prev.confidence == null || obj.confidence > prev.confidence)) {
          prev.confidence = obj.confidence;
        }
      } else {
        itemMap.set(name, { ...obj });
      }
    }
  };

  addItems(existing?.items);
  addItems(incoming?.items);

  const items = Array.from(itemMap.values());
  return { found: items.length, total, items };
}
