/**
 * Video Type Auto-Detector for Pokopia Progress Scanner
 *
 * Rebuilt from scratch using real frame measurements from actual gameplay videos.
 *
 * Measured pixel statistics (1920×1080 frames):
 *
 * POKÉMON GRID (vid1_all, 114 frames):
 *   header: R=230.3 G=130.9 B=149.4 lum=170.2 sat=99.4
 *   center_lum: 228–237  edge_lum: 129–132  sat_pct: 0.0–2.6%
 *
 * HABITAT GRID (vid2_all, 137 frames):
 *   header: R=229.3 G=130.6 B=148.3 lum=169.4 sat=98.7
 *   center_lum: 210–227  edge_lum: 129–130  sat_pct: 12.4–33.9%
 *
 * ITEM/RECIPE GRID (from earlier analysis):
 *   header: teal (G > R × 1.2, G > 200)
 *   center_lum: ~230  edge_lum: ~240  (very light everywhere)
 *
 * Detection strategy:
 *   1. Item/Recipe: teal header + very light edges → "item"
 *   2. Pokémon vs Habitat: both have identical pinkish headers (R~230, G~131, B~149)
 *      → distinguished ONLY by content saturation percentage:
 *        Pokémon: < 6%  |  Habitat: > 6%  |  Threshold: 6%
 *      (gap: Pokémon max 2.6% vs Habitat min 12.4% — huge margin)
 */

// Sample 8 positions spread across the video, avoiding very start/end
const SAMPLE_POSITIONS = [0.08, 0.20, 0.32, 0.44, 0.56, 0.68, 0.80, 0.92];

const FRAME_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 20000;

// Content saturation threshold: Pokémon max=2.6%, Habitat min=12.4%
// Using 6% gives a wide safety margin on both sides
const SAT_THRESHOLD = 6.0;

/**
 * Wrap a promise with a timeout.
 */
function withTimeout(promise, ms, label = 'Operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Load a video file and seek to a specific time position.
 * Returns canvas with the frame drawn on it.
 */
function extractFrame(videoFile, timePosition) {
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

      video.onerror = () => fail('Failed to load video');
      video.onabort = () => fail('Video loading aborted');

      video.onloadedmetadata = () => {
        if (settled) return;
        const duration = video.duration;
        if (!duration || !isFinite(duration) || duration <= 0) {
          fail('Video has no valid duration');
          return;
        }
        video.currentTime = Math.max(0, Math.min(timePosition * duration, duration - 0.1));
      };

      video.onseeked = () => {
        if (settled) return;
        settled = true;
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) { cleanup(); reject(new Error('No valid dimensions')); return; }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          cleanup();
          resolve({ canvas, width: w, height: h, imageData: ctx.getImageData(0, 0, w, h) });
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      video.src = url;
    }),
    FRAME_TIMEOUT_MS,
    `Frame at ${Math.round(timePosition * 100)}%`,
  );
}

/**
 * Compute average RGB for a rectangular region.
 * Coordinates are pixel values. Samples every `step` pixels for speed.
 */
function regionAvgRGB(imageData, x, y, w, h, step = 3) {
  const { data, width: imgW } = imageData;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const x2 = Math.min(x + w, imgW);
  const y2 = Math.min(y + h, imageData.height);

  for (let py = y; py < y2; py += step) {
    for (let px = x; px < x2; px += step) {
      const idx = (py * imgW + px) * 4;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

/**
 * Compute percentage of high-saturation pixels in the content area.
 * Content area: y=15%–85%, x=5%–95% (avoids header, footer, edges).
 * A pixel is "high-saturation" if max(R,G,B) - min(R,G,B) > 30.
 *
 * Measured values:
 *   Pokémon grid: 0.0%–2.6%
 *   Habitat grid: 12.4%–33.9%
 */
function contentSaturationPct(imageData, width, height, step = 3) {
  const { data } = imageData;
  const x1 = Math.floor(width * 0.05);
  const x2 = Math.floor(width * 0.95);
  const y1 = Math.floor(height * 0.15);
  const y2 = Math.floor(height * 0.85);
  let highSat = 0, total = 0;

  for (let py = y1; py < y2; py += step) {
    for (let px = x1; px < x2; px += step) {
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) highSat++;
      total++;
    }
  }
  return total > 0 ? (highSat / total) * 100 : 0;
}

/**
 * Classify a single frame.
 *
 * Decision tree (based on real measured data):
 *
 * 1. ITEM/RECIPE GRID:
 *    - Teal header: G > 200 AND G > R × 1.2
 *    - Very light edges: edge luminance > 220
 *    → type: "item"
 *
 * 2. POKÉMON or HABITAT GRID:
 *    - Pinkish header: R > 200, R > G, header saturation > 50
 *    - Dark sidebars: edge luminance < 180
 *    → Differentiate by content saturation:
 *      sat_pct < 6% → "pokemon"
 *      sat_pct ≥ 6% → "habitat"
 *
 * 3. Otherwise: null (unrecognized)
 */
function classifyFrame(imageData, width, height) {
  const h = height;
  const w = width;

  // Header bar: x=10%–90%, y=5%–10%
  const header = regionAvgRGB(imageData,
    Math.floor(w * 0.10), Math.floor(h * 0.05),
    Math.floor(w * 0.80), Math.floor(h * 0.05));

  // Left edge: x=0–4%, y=20%–80%
  const leftEdge = regionAvgRGB(imageData,
    0, Math.floor(h * 0.20),
    Math.floor(w * 0.04), Math.floor(h * 0.60));

  // Right edge: x=96%–100%, y=20%–80%
  const rightEdge = regionAvgRGB(imageData,
    Math.floor(w * 0.96), Math.floor(h * 0.20),
    Math.floor(w * 0.04), Math.floor(h * 0.60));

  const edgeLum = ((leftEdge.r + leftEdge.g + leftEdge.b) / 3 +
                   (rightEdge.r + rightEdge.g + rightEdge.b) / 3) / 2;

  const headerSat = Math.max(header.r, header.g, header.b) -
                    Math.min(header.r, header.g, header.b);

  const satPct = contentSaturationPct(imageData, width, height);

  const details = {
    header: { r: header.r.toFixed(1), g: header.g.toFixed(1), b: header.b.toFixed(1) },
    headerSat: headerSat.toFixed(1),
    edgeLum: edgeLum.toFixed(1),
    satPct: satPct.toFixed(1),
  };

  // --- 1. ITEM/RECIPE GRID ---
  // Teal header (G dominant) + very light edges
  if (header.g > 200 && header.g > header.r * 1.2 && edgeLum > 220) {
    return { type: 'item', confidence: 'high', details };
  }

  // --- 2. POKÉMON or HABITAT GRID ---
  // Both have pinkish header (R~230, G~131, B~149) with dark sidebars (~130)
  // Measured: R>200, R>G, headerSat~99, edgeLum~130
  if (header.r > 200 && header.r > header.g && headerSat > 50 && edgeLum < 180) {
    if (satPct >= SAT_THRESHOLD) {
      return { type: 'habitat', confidence: 'high', details };
    } else {
      return { type: 'pokemon', confidence: 'high', details };
    }
  }

  // --- 3. Unrecognized ---
  return { type: null, confidence: 'low', details };
}

/**
 * Detect the video type by sampling frames and voting.
 *
 * @param {File} videoFile - The video file to analyze
 * @returns {Promise<{detectedMode: string, confidence: string, detectedAt: string|null}>}
 */
export async function detectVideoType(videoFile) {
  const fallback = { detectedMode: 'all', confidence: 'low', detectedAt: null };

  try {
    return await withTimeout(
      (async () => {
        const votes = { item: 0, habitat: 0, pokemon: 0 };
        let firstDetection = null;

        for (let i = 0; i < SAMPLE_POSITIONS.length; i++) {
          const pos = SAMPLE_POSITIONS[i];
          const label = `${Math.round(pos * 100)}%`;

          let frame;
          try {
            frame = await extractFrame(videoFile, pos);
          } catch (err) {
            console.warn(`[VideoDetector] Frame ${label} failed:`, err.message);
            continue;
          }

          const result = classifyFrame(frame.imageData, frame.width, frame.height);

          // Free canvas memory immediately
          frame.canvas.width = 1;
          frame.canvas.height = 1;

          if (result.type) {
            votes[result.type]++;
            if (!firstDetection) firstDetection = label;
            console.log(`[VideoDetector] ${label}: ${result.type} (satPct=${result.details.satPct}%)`);
          } else {
            console.log(`[VideoDetector] ${label}: unclassified`, result.details);
          }
        }

        // Winner by vote count
        const winner = Object.entries(votes)
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1])[0];

        if (winner) {
          const [mode, count] = winner;
          const total = Object.values(votes).reduce((a, b) => a + b, 0);
          console.log(`[VideoDetector] Result: item=${votes.item} pokemon=${votes.pokemon} habitat=${votes.habitat} → ${mode} (${count}/${total})`);
          return {
            detectedMode: mode,
            confidence: count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low',
            detectedAt: firstDetection,
          };
        }

        console.warn('[VideoDetector] No frames classified, falling back to all');
        return fallback;
      })(),
      TOTAL_TIMEOUT_MS,
      'Video type detection',
    );
  } catch (err) {
    console.warn('[VideoDetector] Detection failed:', err.message);
    return fallback;
  }
}

export default { detectVideoType };
