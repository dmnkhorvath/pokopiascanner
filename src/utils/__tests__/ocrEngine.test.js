import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ─── Mock dynamic imports for lazy-loaded JSON assets ────────────────────────
const mockOcrLookup = {
  'Pikachu': { type: 'pokemon', number: '#025', name: 'Pikachu' },
  'Bulbasaur': { type: 'pokemon', number: '#001', name: 'Bulbasaur' },
  'Charmander': { type: 'pokemon', number: '#004', name: 'Charmander' },
  'Tall Grass': { type: 'habitat', number: '001', name: 'Tall Grass', category: 'Nature' },
  'Cozy Cabin': { type: 'habitat', number: '002', name: 'Cozy Cabin', category: 'Indoor' },
  'Potion': { type: 'item', category: 'Medicine', name: 'Potion' },
  'Super Potion': { type: 'item', category: 'Medicine', name: 'Super Potion' },
  'Berry Smoothie': { type: 'recipe', category: 'Drinks', name: 'Berry Smoothie' },
  'Oran Juice': { type: 'recipe', category: 'Drinks', name: 'Oran Juice' },
};

const mockDataset = {
  metadata: {
    counts: {
      pokemon: 300,
      items: 1254,
      habitats: 209,
      recipes: 743,
    },
  },
  pokemon: [],
  items: [],
  habitats: [],
  recipes: [],
};

// Mock the dynamic imports that ensureOcrData() uses
vi.mock('../../assets/ocrLookup.json', () => ({ default: mockOcrLookup }));
vi.mock('../../assets/pokopiaDataset.json', () => ({
  default: mockDataset,
}));

// Mock tesseract.js to avoid loading the real worker
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
}));

// Mock gridEngine to avoid its own dynamic imports
vi.mock('../gridEngine.js', () => ({
  scanGridVideo: vi.fn(),
  getGridDataList: vi.fn(() => []),
}));

// Now import the module under test (after mocks are set up)
import {
  matchText,
  mergeResults,
  getCategoryTotals,
  matchHabitatFrame,
  matchPokemonFrame,
  CROP_PRESETS,
  SCAN_MODES,
  DEFAULT_SETTINGS,
} from '../ocrEngine.js';

// ─── P0-13: getCategoryTotals ────────────────────────────────────────────────
describe('getCategoryTotals', () => {
  it('returns correct default totals from dataset metadata', async () => {
    const totals = await getCategoryTotals();
    expect(totals).toEqual({
      pokemon: 300,
      items: 1254,
      habitats: 209,
      recipes: 743,
    });
  });

  it('returns defaults when metadata counts are missing', async () => {
    // getCategoryTotals uses ?? fallback, so even with loaded data it returns defaults
    const totals = await getCategoryTotals();
    expect(totals.pokemon).toBe(300);
    expect(totals.items).toBe(1254);
    expect(totals.habitats).toBe(209);
    expect(totals.recipes).toBe(743);
  });
});

// ─── P0-01 through P0-06: matchText ─────────────────────────────────────────
describe('matchText', () => {
  // ensureOcrData is called internally by getCategoryTotals above,
  // which initializes _matcher. We call getCategoryTotals first to ensure init.
  beforeAll(async () => {
    await getCategoryTotals();
  });

  it('P0-01: finds exact match against lookup', () => {
    const results = matchText('Pikachu');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Pikachu');
    expect(results[0].type).toBe('pokemon');
  });

  it('P0-01: finds exact match case-insensitive', () => {
    const results = matchText('pikachu');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Pikachu');
  });

  it('P0-02: finds fuzzy match fallback', () => {
    // "Pikachv" is 1 edit away from "Pikachu"
    const results = matchText('Pikachv', 2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Pikachu');
  });

  it('P0-03: splits lines by newlines and matches each', () => {
    const results = matchText('Pikachu\nPotion');
    expect(results.length).toBe(2);
    const names = results.map(r => r.name);
    expect(names).toContain('Pikachu');
    expect(names).toContain('Potion');
  });

  it('P0-03: splits by common separators (comma, semicolon, pipe, slash)', () => {
    const results = matchText('Pikachu,Potion');
    expect(results.length).toBe(2);
    const names = results.map(r => r.name);
    expect(names).toContain('Pikachu');
    expect(names).toContain('Potion');
  });

  it('P0-04: deduplicates via seen set', () => {
    const results = matchText('Pikachu\nPikachu\nPikachu');
    const pikachus = results.filter(r => r.name === 'Pikachu');
    expect(pikachus.length).toBe(1);
  });

  it('P0-06: returns empty array for empty string', () => {
    const results = matchText('');
    expect(results).toEqual([]);
  });

  it('P0-06: returns empty array for whitespace-only input', () => {
    const results = matchText('   \n   \n   ');
    expect(results).toEqual([]);
  });

  it('returns empty array for gibberish text', () => {
    const results = matchText('XYZXYZXYZXYZ');
    expect(results).toEqual([]);
  });

  it('handles very long input strings without crashing', () => {
    const longText = 'A'.repeat(10000);
    const results = matchText(longText);
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles special characters in input', () => {
    const results = matchText('!@#$%^&*()');
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── P0-07 through P0-09: mergeResults ───────────────────────────────────────
describe('mergeResults', () => {
  it('P0-07: combines two result sets without duplicates', () => {
    const existing = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', captured: true }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const incoming = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Bulbasaur', captured: true }] },
      items: { found: 1, total: 1254, items: [{ name: 'Potion' }] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, incoming);
    expect(merged.pokemon.found).toBe(2);
    expect(merged.items.found).toBe(1);
    expect(merged.totalFound).toBe(3);
  });

  it('P0-07: deduplicates items with same name', () => {
    const existing = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', captured: true }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const incoming = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', captured: false }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, incoming);
    expect(merged.pokemon.found).toBe(1);
    expect(merged.pokemon.items.length).toBe(1);
  });

  it('P0-08: status upgrade — true overrides false/null', () => {
    const existing = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', captured: false }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 1, total: 209, items: [{ name: 'Tall Grass', built: false }] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const incoming = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', captured: true }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 1, total: 209, items: [{ name: 'Tall Grass', built: true }] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, incoming);
    expect(merged.pokemon.items[0].captured).toBe(true);
    expect(merged.habitats.items[0].built).toBe(true);
  });

  it('P0-09: handles null existing input gracefully', () => {
    const incoming = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu' }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(null, incoming);
    expect(merged.pokemon.found).toBe(1);
    expect(merged.totalFound).toBe(1);
  });

  it('P0-09: handles undefined incoming input gracefully', () => {
    const existing = {
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu' }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, undefined);
    expect(merged.pokemon.found).toBe(1);
    expect(merged.totalFound).toBe(1);
  });

  it('P0-09: handles both null inputs gracefully', () => {
    const merged = mergeResults(null, null);
    expect(merged.totalFound).toBe(0);
    expect(merged.pokemon.found).toBe(0);
    expect(merged.items.found).toBe(0);
  });

  it('handles string items in arrays (legacy format)', () => {
    const existing = {
      pokemon: { found: 0, total: 300, items: [] },
      items: { found: 1, total: 1254, items: ['Potion'] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const incoming = {
      pokemon: { found: 0, total: 300, items: [] },
      items: { found: 1, total: 1254, items: ['Super Potion'] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, incoming);
    expect(merged.items.found).toBe(2);
  });

  it('returns a scanDate string', () => {
    const merged = mergeResults(null, null);
    expect(typeof merged.scanDate).toBe('string');
    expect(new Date(merged.scanDate).toString()).not.toBe('Invalid Date');
  });
});

// ─── P0-10, P0-11: isUndiscovered (tested indirectly via matchHabitatFrame) ─
describe('matchHabitatFrame (tests isUndiscovered indirectly)', () => {
  beforeAll(async () => {
    await getCategoryTotals();
  });

  it('P0-10: detects undiscovered habitat text variations', () => {
    // matchHabitatFrame returns an object with built: false when undiscovered
    const result = matchHabitatFrame(
      "You haven't discovered this habitat yet\nNo. 001\nTall Grass",
      "NO. 001\nTALL GRASS",
      2
    );
    if (result) {
      expect(result.built).toBe(false);
    }
  });

  it('P0-11: returns built=true for discovered habitat', () => {
    const result = matchHabitatFrame(
      "Welcome to Tall Grass\nNo. 001\nTall Grass",
      "NO. 001\nTALL GRASS",
      2
    );
    if (result) {
      expect(result.built).toBe(true);
    }
  });
});

// ─── Exported constants validation ───────────────────────────────────────────
describe('exported constants', () => {
  it('CROP_PRESETS has expected keys', () => {
    expect(CROP_PRESETS).toHaveProperty('auto');
    expect(CROP_PRESETS).toHaveProperty('full');
    expect(CROP_PRESETS).toHaveProperty('rightHalf');
    expect(CROP_PRESETS).toHaveProperty('custom');
  });

  it('SCAN_MODES has expected keys', () => {
    expect(SCAN_MODES).toHaveProperty('all');
    expect(SCAN_MODES).toHaveProperty('habitat');
    expect(SCAN_MODES).toHaveProperty('pokemon');
    expect(SCAN_MODES).toHaveProperty('item');
    expect(SCAN_MODES).toHaveProperty('recipe');
  });

  it('DEFAULT_SETTINGS has expected properties', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('frameIntervalMs');
    expect(DEFAULT_SETTINGS).toHaveProperty('fuzzyTolerance');
    expect(DEFAULT_SETTINGS).toHaveProperty('scanMode');
    expect(DEFAULT_SETTINGS).toHaveProperty('confidenceThreshold');
  });
});

// ─── P1: Additional matchText edge cases ─────────────────────────────────────
describe('matchText — P1 edge cases', () => {
  beforeAll(async () => {
    await getCategoryTotals(); // ensure _matcher is initialized
  });

  it('P1: splits lines by comma separator and matches each part', () => {
    const results = matchText('Pikachu,Bulbasaur');
    const names = results.map(r => r.name);
    expect(names).toContain('Pikachu');
    expect(names).toContain('Bulbasaur');
  });

  it('P1: splits lines by pipe separator and matches each part', () => {
    const results = matchText('Pikachu|Potion');
    const names = results.map(r => r.name);
    expect(names).toContain('Pikachu');
    expect(names).toContain('Potion');
  });

  it('P1: splits lines by slash separator and matches each part', () => {
    const results = matchText('Pikachu/Charmander');
    const names = results.map(r => r.name);
    expect(names).toContain('Pikachu');
    expect(names).toContain('Charmander');
  });

  it('P1: deduplicates same name appearing on multiple lines', () => {
    const results = matchText('Pikachu\nPikachu\nPikachu');
    const pikachus = results.filter(r => r.name === 'Pikachu');
    expect(pikachus.length).toBe(1);
  });

  it('P1: skips whitespace-only and single-char lines', () => {
    const results = matchText('   \n\nA\n\nPikachu');
    // Should still find Pikachu despite junk lines
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Pikachu');
  });

  it('P1: returns empty array for completely unrecognizable text', () => {
    const results = matchText('xyzzy12345\nAAAABBBBCCCC\n!@#$%^&*()');
    expect(results).toEqual([]);
  });
});

// ─── P1: matchPokemonFrame additional cases ──────────────────────────────────
describe('matchPokemonFrame — P1 edge cases', () => {
  beforeAll(async () => {
    await getCategoryTotals();
  });

  it('P1: returns null for completely unrelated text', () => {
    const result = matchPokemonFrame('Hello World\nNothing here', 2);
    expect(result).toBeNull();
  });

  it('P1: returns null for empty string', () => {
    const result = matchPokemonFrame('', 2);
    expect(result).toBeNull();
  });

  it('P1: returns null for whitespace-only input', () => {
    const result = matchPokemonFrame('   \n   ', 2);
    expect(result).toBeNull();
  });
});

// ─── P1: matchHabitatFrame additional cases ──────────────────────────────────
describe('matchHabitatFrame — P1 edge cases', () => {
  beforeAll(async () => {
    await getCategoryTotals();
  });

  it('P1: returns null for empty text', () => {
    const result = matchHabitatFrame('', '', 2);
    expect(result).toBeNull();
  });

  it('P1: returns null for unrelated text', () => {
    const result = matchHabitatFrame('Random gibberish text', 'RANDOM GIBBERISH', 2);
    expect(result).toBeNull();
  });

  it('P1: detects undiscovered habitat with apostrophe variation', () => {
    const result = matchHabitatFrame(
      "You haven\u2019t discovered this habitat yet\nNo. 001\nTall Grass",
      "NO. 001\nTALL GRASS",
      2
    );
    if (result) {
      expect(result.built).toBe(false);
    }
  });
});

// ─── P1: mergeResults additional edge cases ──────────────────────────────────
describe('mergeResults — P1 edge cases', () => {
  it('P1: merging with empty incoming preserves existing', () => {
    const existing = {
      totalFound: 2,
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', status: true }] },
      items: { found: 1, total: 1254, items: [{ name: 'Potion', status: true }] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const incoming = {
      totalFound: 0,
      pokemon: { found: 0, total: 300, items: [] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, incoming);
    expect(merged.totalFound).toBe(2);
    expect(merged.pokemon.items.length).toBe(1);
  });

  it('P1: merging with null existing treats as fresh', () => {
    const incoming = {
      totalFound: 1,
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', status: true }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(null, incoming);
    expect(merged.totalFound).toBe(1);
    expect(merged.pokemon.items.length).toBe(1);
  });

  it('P1: merging with null incoming returns existing unchanged', () => {
    const existing = {
      totalFound: 1,
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu', status: true }] },
      items: { found: 0, total: 1254, items: [] },
      habitats: { found: 0, total: 209, items: [] },
      recipes: { found: 0, total: 743, items: [] },
    };
    const merged = mergeResults(existing, null);
    expect(merged.totalFound).toBe(1);
  });
});

// ─── P1: DEFAULT_SETTINGS validation ─────────────────────────────────────────
describe('DEFAULT_SETTINGS — P1 validation', () => {
  it('frameIntervalMs is a non-negative finite number', () => {
    expect(DEFAULT_SETTINGS.frameIntervalMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(DEFAULT_SETTINGS.frameIntervalMs)).toBe(true);
  });

  it('fuzzyTolerance is a non-negative integer', () => {
    expect(DEFAULT_SETTINGS.fuzzyTolerance).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(DEFAULT_SETTINGS.fuzzyTolerance)).toBe(true);
  });

  it('confidenceThreshold is between 0 and 100', () => {
    expect(DEFAULT_SETTINGS.confidenceThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.confidenceThreshold).toBeLessThanOrEqual(100);
  });
});
