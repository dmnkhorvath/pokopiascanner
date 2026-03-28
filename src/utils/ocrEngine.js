/**
 * OCR Engine for Pokopia Progress Scanner
 * Handles video frame extraction, preprocessing, and text recognition.
 */
import { createWorker } from 'tesseract.js';
import { buildFuzzyMatcher } from './fuzzyMatch.js';
import ocrLookup from '../assets/ocrLookup.json';

// Pre-build the fuzzy matcher once
const matcher = buildFuzzyMatcher(ocrLookup);

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
 * Default scanner settings
 */
export const DEFAULT_SETTINGS = {
  frameSkip: 0,
  processingDelay: 10,
  cropPreset: 'auto',
  customCrop: { x: 0, y: 0, w: 100, h: 100 },
  confidenceThreshold: 40,
  fuzzyTolerance: 2,
};

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
export async function scanVideo(videoFile, settings, onProgress, onMatch, signal) {
  const {
    frameSkip = 0,
    processingDelay = 10,
    cropPreset = 'auto',
    customCrop = { x: 0, y: 0, w: 100, h: 100 },
    confidenceThreshold = 40,
    fuzzyTolerance = 2,
  } = settings;

  // Determine crop region
  const cropRegion = cropPreset === 'custom'
    ? customCrop
    : CROP_PRESETS[cropPreset] || CROP_PRESETS.auto;

  // Results accumulator
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

  // Wait for video metadata
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const duration = video.duration;
  const fps = 1; // Process ~1 frame per second
  const frameInterval = 1 / fps;
  const totalFrames = Math.floor(duration / frameInterval);
  const skipAmount = frameSkip > 0 ? frameSkip + 1 : 1;
  const framesToProcess = Math.ceil(totalFrames / skipAmount);

  onProgress({
    phase: 'init',
    current: 0,
    total: framesToProcess,
    percent: 0,
    message: `Initializing OCR engine... (${framesToProcess} frames to process)`,
  });

  // Initialize Tesseract worker
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  });

  // Create processing canvas
  const canvas = document.createElement('canvas');
  let processedFrames = 0;
  let frameIndex = 0;

  // Create a canvas for frame preview
  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');

  try {
    for (let time = 0; time < duration; time += frameInterval * skipAmount) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new DOMException('Scan cancelled', 'AbortError');
      }

      // Seek to frame
      video.currentTime = time;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      // Extract and preprocess frame
      extractFrame(video, canvas, cropRegion);

      // Generate preview (unprocessed)
      previewCanvas.width = video.videoWidth;
      previewCanvas.height = video.videoHeight;
      previewCtx.drawImage(video, 0, 0);
      const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.5);

      // Run OCR
      const { data } = await worker.recognize(canvas);

      if (data.confidence >= confidenceThreshold && data.text.trim()) {
        // Match against lookup
        const matches = matchText(data.text, fuzzyTolerance);

        const newItems = [];
        for (const match of matches) {
          const type = match.type;
          if (results[type] && !results[type].has(match.name)) {
            results[type].set(match.name, match);
            newItems.push(match);
          }
        }

        if (newItems.length > 0) {
          onMatch({ items: newItems, frameIndex });
        }
      }

      processedFrames++;
      frameIndex++;

      onProgress({
        phase: 'scanning',
        current: processedFrames,
        total: framesToProcess,
        percent: Math.round((processedFrames / framesToProcess) * 100),
        message: `Scanning frame ${processedFrames}/${framesToProcess}`,
        currentFrame: previewDataUrl,
        timePosition: time,
        duration,
      });

      // Processing delay
      if (processingDelay > 0) {
        await new Promise(r => setTimeout(r, processingDelay));
      }
    }
  } finally {
    await worker.terminate();
    URL.revokeObjectURL(videoUrl);
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
    message: `Scan complete! Found ${finalResults.totalFound} items.`,
  });

  return finalResults;
}

/**
 * Get category totals from the dataset
 */
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
  const nameSet = new Set();
  const items = [];

  const addItems = (arr) => {
    if (!arr) return;
    for (const item of arr) {
      const name = item.name || item;
      if (!nameSet.has(name)) {
        nameSet.add(name);
        items.push(typeof item === 'string' ? { name: item } : item);
      }
    }
  };

  addItems(existing?.items);
  addItems(incoming?.items);

  return { found: items.length, total, items };
}
