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
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for FPS detection'));
    };

    video.onloadedmetadata = () => {
      // Fallback if requestVideoFrameCallback is not supported
      if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
        URL.revokeObjectURL(url);
        // Default assumption: 30fps
        resolve({ fps: 30, frameIntervalMs: 33, detected: false });
        return;
      }

      const frameTimes = [];
      let startTime = null;
      let callbackId = null;

      const onFrame = (now, metadata) => {
        if (startTime === null) startTime = now;
        frameTimes.push(metadata.mediaTime);

        if (now - startTime < sampleDurationMs) {
          callbackId = video.requestVideoFrameCallback(onFrame);
        } else {
          video.pause();
          URL.revokeObjectURL(url);

          if (frameTimes.length < 3) {
            // Not enough frames sampled, fallback
            resolve({ fps: 30, frameIntervalMs: 33, detected: false });
            return;
          }

          // Calculate intervals between consecutive frames
          const intervals = [];
          for (let i = 1; i < frameTimes.length; i++) {
            const diff = frameTimes[i] - frameTimes[i - 1];
            if (diff > 0) intervals.push(diff);
          }

          if (intervals.length === 0) {
            resolve({ fps: 30, frameIntervalMs: 33, detected: false });
            return;
          }

          // Use median interval for robustness
          intervals.sort((a, b) => a - b);
          const medianInterval = intervals[Math.floor(intervals.length / 2)];
          const fps = Math.round(1 / medianInterval);
          const frameIntervalMs = Math.round(medianInterval * 1000);

          resolve({ fps, frameIntervalMs, detected: true });
        }
      };

      video.oncanplay = () => {
        callbackId = video.requestVideoFrameCallback(onFrame);
        video.play().catch(() => {
          URL.revokeObjectURL(url);
          resolve({ fps: 30, frameIntervalMs: 33, detected: false });
        });
      };
    };
  });
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


/**
 * Habitat-specific frame analysis.
 * Looks for 'No. {xxx}' pattern and habitat name in the upper region,
 * then checks for "You haven't discovered this habitat yet." to determine built status.
 * @param {string} fullText - Full frame OCR text
 * @param {string} upperText - Upper quarter OCR text  
 * @param {number} fuzzyTolerance - Max Levenshtein distance
 * @returns {Object|null} { name, number, type, built } or null
 */
export function matchHabitatFrame(fullText, upperText, fuzzyTolerance = 2) {
  const lines = upperText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let habitatNumber = null;
  let habitatName = null;
  let nameLineIdx = -1;

  // Look for 'No. XXX' pattern in upper text
  for (let i = 0; i < lines.length; i++) {
    const noMatch = lines[i].match(/No\.?\s*(\d{1,3})/i);
    if (noMatch) {
      habitatNumber = noMatch[1].padStart(3, '0');
      // The habitat name should be on the next line
      if (i + 1 < lines.length) {
        nameLineIdx = i + 1;
        habitatName = lines[nameLineIdx];
      }
      break;
    }
  }

  if (!habitatName) return null;

  // Try to match the habitat name against our lookup
  const result = matcher.findMatch(habitatName, fuzzyTolerance);
  if (!result || result.type !== 'habitat') {
    // If fuzzy match didn't find a habitat, try other lines near the number
    for (let offset = -1; offset <= 2; offset++) {
      if (offset === 1) continue; // already tried i+1
      const idx = (nameLineIdx - 1) + offset;
      if (idx >= 0 && idx < lines.length) {
        const altResult = matcher.findMatch(lines[idx], fuzzyTolerance);
        if (altResult && altResult.type === 'habitat') {
          habitatName = lines[idx];
          return {
            ...altResult,
            number: habitatNumber || altResult.number,
            built: !isUndiscovered(fullText),
          };
        }
      }
    }
    return null;
  }

  return {
    ...result,
    number: habitatNumber || result.number,
    built: !isUndiscovered(fullText),
  };
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
         lower.includes("haven't discovered this habitat") ||
         lower.includes("not discovered this habitat") ||
         lower.includes("haven’t discovered this habitat");
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
 * @param {number} poolSize - Number of workers to create
 * @returns {Promise<Array>} Array of initialized Tesseract workers
 */
/**
 * Create a pool of Tesseract workers for parallel OCR.
 * @param {number} poolSize
 * @returns {Promise<Array>}
 */
async function createWorkerPool(poolSize) {
  const workers = await Promise.all(
    Array.from({ length: poolSize }, () =>
      createWorker('eng', 1, { logger: () => {} })
    )
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
 * @param {string} mode - 'standard' or 'green'
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
 * Create and run the OCR scanning pipeline with parallel worker pool.
 * Uses batched processing to keep memory bounded (mobile-safe).
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
  const maxWorkers = mobile ? 2 : 4;
  const poolSize = Math.min(
    navigator.hardwareConcurrency || 4,
    maxWorkers,
    Math.max(1, Math.floor(framesToProcess / 2))
  );

  // Batch size: how many frames to extract before OCR-ing them
  // Keeps memory bounded — especially important on iOS Safari
  const batchSize = poolSize * 4;

  onProgress({
    phase: 'init', current: 0, total: framesToProcess, percent: 0,
    message: `Initializing ${poolSize} parallel OCR workers${mobile ? ' (mobile mode)' : ''}... (${framesToProcess} frames at ${frameIntervalMs}ms intervals)`,
  });

  const workers = await createWorkerPool(poolSize);

  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');

  let processedCount = 0;

  /**
   * Process a single job with a given worker.
   */
  async function processJob(job, worker) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');

    if (scanMode === 'habitat') {
      const { data: upperData } = await worker.recognize(job.canvases.upper);
      const { data: fullData } = await worker.recognize(job.canvases.bottom);

      if (upperData.confidence >= confidenceThreshold && upperData.text.trim()) {
        const habitat = matchHabitatFrame(fullData.text, upperData.text, fuzzyTolerance);
        if (habitat && !results.habitat.has(habitat.name)) {
          results.habitat.set(habitat.name, habitat);
          onMatch({ items: [habitat], frameIndex: job.index });
        } else if (habitat && results.habitat.has(habitat.name)) {
          const existing = results.habitat.get(habitat.name);
          if (!existing.built && habitat.built) {
            results.habitat.set(habitat.name, habitat);
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
        }
      }
    }

    // Free canvas memory immediately
    Object.values(job.canvases).forEach(freeCanvas);
    job.canvases = null;

    processedCount++;
    onProgress({
      phase: 'scanning',
      current: processedCount,
      total: framesToProcess,
      percent: Math.round((processedCount / framesToProcess) * 100),
      message: `Scanning: ${processedCount}/${framesToProcess} (${poolSize} workers${mobile ? ', mobile' : ''})`,
      currentFrame: job.previewDataUrl,
      timePosition: job.time,
      duration,
    });
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
          await processJob(job, workers[wIdx]);
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

      // Seek
      video.currentTime = time;
      await new Promise((resolve) => { video.onseeked = resolve; });

      // Preview
      previewCanvas.width = video.videoWidth;
      previewCanvas.height = video.videoHeight;
      previewCtx.drawImage(video, 0, 0);
      const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.5);

      // Extract preprocessed canvases
      const job = { index: frameIdx, time, previewDataUrl, canvases: {} };

      if (scanMode === 'habitat') {
        const upperCrop = { x: cropRegion.x, y: cropRegion.y, w: cropRegion.w, h: Math.min(15, cropRegion.h) };
        job.canvases.upper = extractFrameToCanvas(video, upperCrop, 'green');
        const bottomCrop = { x: cropRegion.x, y: 50, w: cropRegion.w, h: 50 };
        job.canvases.bottom = extractFrameToCanvas(video, bottomCrop, 'standard');
      } else {
        job.canvases.full = extractFrameToCanvas(video, cropRegion, 'standard');
      }

      batch.push(job);
      frameIdx++;

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
      ? `Scan complete! Found ${finalResults.habitats.found} habitats (${finalResults.habitats.items.filter(h => h.built).length} built, ${finalResults.habitats.items.filter(h => !h.built).length} not built). ${poolSize} workers${mobile ? ' (mobile)' : ''}.`
      : `Scan complete! Found ${finalResults.totalFound} items. ${poolSize} workers${mobile ? ' (mobile)' : ''}.`,
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
