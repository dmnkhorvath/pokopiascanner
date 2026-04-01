/**
 * Video Type Auto-Detector for Pokopia Progress Scanner
 *
 * Analyzes sample frames from a video to determine the scan mode:
 * - Item grid: very light background, teal header, grid of square tiles
 * - Pokémon: lime-green right panel (3D model display area)
 * - Habitat: purple banner with "No. XXX" and landscape illustration
 * - Falls back to 'all' if nothing is detected
 *
 * Detection is based on pixel-level color analysis of specific frame regions,
 * calibrated against real Pokopia gameplay footage.
 */

// Sample positions as percentage of video duration
// 5 positions for robust voting, avoiding very start/end transitions
const SAMPLE_POSITIONS = [0.10, 0.25, 0.45, 0.65, 0.85];
const SAMPLE_LABELS = ['10%', '25%', '45%', '65%', '85%'];

// Timeouts
const FRAME_TIMEOUT_MS = 5000;   // 5s per frame extraction
const TOTAL_TIMEOUT_MS = 20000;  // 20s total for all detection (5 frames)

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
 * Compute average RGB for a rectangular region of ImageData.
 * Samples every `step` pixels for speed.
 */
function regionAvgRGB(imageData, x, y, w, h, step = 3) {
  const { data, width: imgW } = imageData;
  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  const x2 = Math.min(x + w, imgW);
  const y2 = Math.min(y + h, imageData.height);

  for (let py = y; py < y2; py += step) {
    for (let px = x; px < x2; px += step) {
      const idx = (py * imgW + px) * 4;
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: totalR / count,
    g: totalG / count,
    b: totalB / count,
    lum: (totalR + totalG + totalB) / (count * 3),
  };
}

/**
 * Classify a single frame based on pixel regions.
 *
 * Regions analyzed (calibrated from real 1920x1080 Pokopia footage):
 *
 * ITEM GRID signature:
 *   - Overall very light frame (center luminance > 220)
 *   - Edges near-white (luminance > 230)
 *   - Teal header bar at y 5-10% (G > 200, G > R * 1.2)
 *
 * POKEMON signature (primary):
 *   - Lime-green right panel at x 70-90%, y 30-70%
 *   - Green-Blue gap > 50 and G > 200 (3D model display area)
 *   - Catches ALL Pokémon types including purple-banner ones
 *
 * HABITAT signature:
 *   - Purple banner at y 3-8% center (B > R, B > G, B > 130, G < 140)
 *   - Only reached when right panel is NOT lime-green
 *
 * POKEMON signature (fallback):
 *   - Saturated non-purple banner at y 3-8% (sat > 25, lum 60-200)
 *
 * @returns {{ type: string|null, confidence: string, details: object }}
 */
function classifyFrame(imageData, width, height) {
  // --- Region definitions ---
  // Banner region at y=3%-8% avoids top decoration that dilutes colors
  const topBanner = regionAvgRGB(imageData,
    Math.floor(width * 0.25), Math.floor(height * 0.03),
    Math.floor(width * 0.50), Math.floor(height * 0.05));

  const headerBar = regionAvgRGB(imageData,
    Math.floor(width * 0.10), Math.floor(height * 0.05),
    Math.floor(width * 0.80), Math.floor(height * 0.05));

  const centerContent = regionAvgRGB(imageData,
    Math.floor(width * 0.20), Math.floor(height * 0.20),
    Math.floor(width * 0.60), Math.floor(height * 0.60));

  const leftEdge = regionAvgRGB(imageData,
    0, Math.floor(height * 0.20),
    Math.floor(width * 0.04), Math.floor(height * 0.60));

  const rightEdge = regionAvgRGB(imageData,
    Math.floor(width * 0.96), Math.floor(height * 0.20),
    Math.floor(width * 0.04), Math.floor(height * 0.60));

  const edgeLum = (leftEdge.lum + rightEdge.lum) / 2;

  // Right panel (tight): 70-90% width, 30-70% height
  // Pokémon detail pages have a distinctive lime-green 3D model display area
  const rightPanel = regionAvgRGB(imageData,
    Math.floor(width * 0.70), Math.floor(height * 0.30),
    Math.floor(width * 0.20), Math.floor(height * 0.40));

  const rightGreenGap = rightPanel.g - rightPanel.b;

  const details = { topBanner, headerBar, centerContent, leftEdge, rightEdge, edgeLum, rightPanel, rightGreenGap };

  // --- 1. ITEM GRID detection ---
  // Item grid has very light background everywhere and teal-ish header
  // Real data: center lum ~230, edges lum ~240, header G ~225 R ~169
  if (centerContent.lum > 220 && edgeLum > 230 && headerBar.g > 200 && headerBar.g > headerBar.r * 1.2) {
    return { type: 'item', confidence: 'high', details };
  }

  // --- 2. POKEMON detection (primary) via lime-green right panel ---
  // Pokémon detail pages have a 3D model display area on the right side
  // Real data: right panel G ~238-242, B ~161-174, gap ~67-81
  // Habitat detail pages have a muted right side: gap ~18-37
  if (rightGreenGap > 50 && rightPanel.g > 200) {
    return { type: 'pokemon', confidence: 'high', details };
  }

  // --- 3. HABITAT detection ---
  // Habitat has a distinctive purple banner: B > R > G
  // Real data: banner R~166 G~118 B~205 consistently across all frames
  if (topBanner.b > topBanner.r && topBanner.b > topBanner.g &&
      topBanner.b > 130 && topBanner.g < 140 &&
      (topBanner.b - topBanner.g) > 30) {
    return { type: 'habitat', confidence: 'high', details };
  }

  // --- 4. POKEMON detection (fallback) via saturated banner ---
  // Catches Pokémon with non-purple, non-green-panel frames (e.g. transitions)
  const bannerMax = Math.max(topBanner.r, topBanner.g, topBanner.b);
  const bannerMin = Math.min(topBanner.r, topBanner.g, topBanner.b);
  const bannerSat = bannerMax - bannerMin;
  if (bannerSat > 25 && topBanner.lum < 200 && topBanner.lum > 60) {
    const isPurple = topBanner.b > topBanner.r && topBanner.b > topBanner.g && (topBanner.b - topBanner.g) > 30;
    if (!isPurple) {
      return { type: 'pokemon', confidence: bannerSat > 40 ? 'high' : 'medium', details };
    }
  }

  return { type: null, confidence: 'low', details };
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
    return await withTimeout(
      (async () => {
        // Collect votes from all frames for robustness
        const votes = { item: 0, habitat: 0, pokemon: 0 };
        const confidences = { item: 'low', habitat: 'low', pokemon: 'low' };
        let firstDetection = null;

        for (let i = 0; i < SAMPLE_POSITIONS.length; i++) {
          const position = SAMPLE_POSITIONS[i];
          const label = SAMPLE_LABELS[i];

          let frame;
          try {
            frame = await loadVideoFrame(videoFile, position);
          } catch (err) {
            console.warn(`Frame extraction at ${label} failed:`, err.message);
            continue;
          }

          const { imageData, width, height } = frame;
          const result = classifyFrame(imageData, width, height);

          // Free canvas memory
          frame.canvas.width = 1;
          frame.canvas.height = 1;

          if (result.type) {
            votes[result.type]++;
            if (result.confidence === 'high') confidences[result.type] = 'high';
            if (!firstDetection) firstDetection = label;
            console.log(`[VideoDetector] Frame ${label}: ${result.type} (${result.confidence})`);
          } else {
            console.log(`[VideoDetector] Frame ${label}: unclassified`);
          }
        }

        // Determine winner by vote count
        const winner = Object.entries(votes)
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1])[0];

        if (winner) {
          const [mode, count] = winner;
          return {
            detectedMode: mode,
            confidence: count >= 3 ? 'high' : (count >= 2 ? 'medium' : confidences[mode]),
            detectedAt: firstDetection,
          };
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
