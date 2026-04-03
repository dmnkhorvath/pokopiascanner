import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectVideoType } from '../videoDetector.js';

// Mock URL.createObjectURL to throw immediately so detectVideoType
// hits its catch block and returns the fallback without waiting for
// video element timeouts (which would take 20+ seconds in JSDOM).
const origCreateObjectURL = globalThis.URL.createObjectURL;
const origRevokeObjectURL = globalThis.URL.revokeObjectURL;

/**
 * videoDetector.detectVideoType() is heavily coupled to browser APIs:
 * - document.createElement('video') with src, onloadedmetadata, onseeked
 * - URL.createObjectURL / revokeObjectURL
 * - canvas 2D context for frame extraction
 *
 * In JSDOM (Vitest default), these APIs are stubs/missing, so extractFrame
 * always fails and detectVideoType falls back to { detectedMode: 'all' }.
 *
 * These tests verify:
 * 1. The function handles graceful degradation (returns fallback)
 * 2. The return shape contract is correct
 * 3. Various input edge cases don't throw
 */

describe('detectVideoType', () => {
  beforeEach(() => {
    // Make createObjectURL throw so detectVideoType fails fast
    globalThis.URL.createObjectURL = vi.fn(() => { throw new Error('JSDOM: no createObjectURL'); });
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.URL.createObjectURL = origCreateObjectURL;
    globalThis.URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  // ─── Return shape contract ───────────────────────────────────────────────

  it('returns an object with detectedMode, confidence, and detectedAt', async () => {
    const fakeFile = new Blob(['fake'], { type: 'video/mp4' });
    const result = await detectVideoType(fakeFile);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('detectedMode');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('detectedAt');
  });

  it('detectedMode is a string', async () => {
    const fakeFile = new Blob(['fake'], { type: 'video/mp4' });
    const result = await detectVideoType(fakeFile);
    expect(typeof result.detectedMode).toBe('string');
  });

  it('confidence is one of high, medium, low', async () => {
    const fakeFile = new Blob(['fake'], { type: 'video/mp4' });
    const result = await detectVideoType(fakeFile);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  // ─── Graceful degradation ────────────────────────────────────────────────

  it('falls back to "all" when frames cannot be extracted (JSDOM)', async () => {
    const fakeFile = new Blob(['fake'], { type: 'video/mp4' });
    const result = await detectVideoType(fakeFile);
    expect(result.detectedMode).toBe('all');
    expect(result.confidence).toBe('low');
  });

  it('falls back to "all" with detectedAt=null on failure', async () => {
    const fakeFile = new Blob(['fake'], { type: 'video/mp4' });
    const result = await detectVideoType(fakeFile);
    expect(result.detectedAt).toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  it('handles empty Blob without throwing', async () => {
    const emptyBlob = new Blob([], { type: 'video/mp4' });
    const result = await detectVideoType(emptyBlob);
    expect(result).toBeDefined();
    expect(result.detectedMode).toBe('all');
  });

  it('handles non-video Blob without throwing', async () => {
    const textBlob = new Blob(['hello world'], { type: 'text/plain' });
    const result = await detectVideoType(textBlob);
    expect(result).toBeDefined();
    expect(result.detectedMode).toBe('all');
  });

  it('handles null input without throwing', async () => {
    const result = await detectVideoType(null);
    expect(result).toBeDefined();
    expect(result.detectedMode).toBe('all');
  });

  it('handles undefined input without throwing', async () => {
    const result = await detectVideoType(undefined);
    expect(result).toBeDefined();
    expect(result.detectedMode).toBe('all');
  });
});
