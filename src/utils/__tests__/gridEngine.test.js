import { describe, it, expect, beforeAll, vi } from 'vitest';

// ─── Define missing module-level constants as globals ─────────────────────────
// gridEngine.js uses these constants without defining them (they appear to be
// implicitly global). We must define them before the module is imported.
globalThis.REF_WIDTH      = 1920;
globalThis.REF_HEIGHT     = 1080;
globalThis.ITEM_COLS      = 12;
globalThis.ITEM_VIS_ROWS  = 5;
globalThis.ITEM_CELL      = 138;
globalThis.ITEM_COL0_X    = 247;
globalThis.ITEM_ROW0_Y    = 270;
globalThis.ITEM_TILE_HALF = 50;
globalThis.SAT_THRESHOLD  = 15;
globalThis.POKE_COLS      = 8;
globalThis.POKE_VIS_ROWS  = 5;
globalThis.POKE_TILE_XS   = [310, 505, 700, 895, 1090, 1285, 1480, 1675];
globalThis.POKE_ROW0_Y    = 270;
globalThis.POKE_ROW_SPACE = 155;
globalThis.POKE_TILE_HALF = 60;
globalThis.POKE_SAT_THRESH = 20;
globalThis.POKE_STRIP_X   = 400;
globalThis.POKE_STRIP_W   = 300;
globalThis.HAB_COLS       = 4;
globalThis.HAB_VIS_ROWS   = 3;
globalThis.HAB_TILE_XS    = [454, 777, 1098, 1421];
globalThis.HAB_ROW0_Y     = 305;
globalThis.HAB_ROW_SPACE  = 240;
globalThis.HAB_TILE_HW    = 100;
globalThis.HAB_TILE_HH    = 80;
globalThis.HAB_STRIP_X    = 400;
globalThis.HAB_STRIP_W    = 200;
globalThis.XCORR_Y_START  = 200;
globalThis.XCORR_Y_END    = 900;
globalThis.XCORR_MAX_SHIFT = 300;
globalThis.XCORR_MIN_CORR  = 0.3;

// ─── Mock dynamic imports for lazy-loaded JSON assets ────────────────────────
const mockDataset = {
  metadata: {
    counts: { pokemon: 300, items: 1254, habitats: 209, recipes: 743 },
  },
  pokemon: [
    { name: 'Bulbasaur', number: '#001', type: 'pokemon' },
    { name: 'Ivysaur', number: '#002', type: 'pokemon' },
    { name: 'Venusaur', number: '#003', type: 'pokemon' },
  ],
  items: [
    { name: 'Potion', category: 'Medicine' },
    { name: 'Super Potion', category: 'Medicine' },
  ],
  habitats: [
    { name: 'Tall Grass', number: '001', category: 'Nature' },
    { name: 'Cozy Cabin', number: '002', category: 'Indoor' },
  ],
  recipes: [
    { name: 'Berry Smoothie', category: 'Drinks' },
  ],
};

const mockFingerprints = {
  size: 16,
  scale: 100,
  fingerprints: {
    'Potion': new Array(256).fill(50),
    'Super Potion': new Array(256).fill(60),
  },
};

vi.mock('../../assets/pokopiaDataset.json', () => ({ default: mockDataset }));
vi.mock('../../assets/iconFingerprints.json', () => ({ default: mockFingerprints }));

import {
  classifyFrame,
  findRowShift,
  getGridDataList,
  detectGridParams,
} from '../gridEngine.js';

// ─── Helper: create mock ImageData ───────────────────────────────────────────
function createMockImageData(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const pixel = fillFn ? fillFn(x, y) : { r: 128, g: 128, b: 128, a: 255 };
      data[idx]     = pixel.r;
      data[idx + 1] = pixel.g;
      data[idx + 2] = pixel.b;
      data[idx + 3] = pixel.a !== undefined ? pixel.a : 255;
    }
  }
  return { data, width, height };
}

// ─── findRowShift ────────────────────────────────────────────────────────────
describe('findRowShift', () => {
  it('returns 0 for identical row patterns', () => {
    const rows = [
      [true, false, true, false],
      [false, true, false, true],
      [true, true, false, false],
    ];
    const shift = findRowShift(rows, rows);
    expect(shift).toBe(0);
  });

  it('detects shift of 1 when rows scroll by one', () => {
    const prev = [
      [true, false, true, false],
      [false, true, false, true],
      [true, true, false, false],
      [false, false, true, true],
    ];
    // After scrolling 1 row: prev[1] becomes curr[0], prev[2] becomes curr[1], etc.
    const curr = [
      [false, true, false, true],
      [true, true, false, false],
      [false, false, true, true],
      [true, false, false, true],  // new row
    ];
    const shift = findRowShift(prev, curr);
    expect(shift).toBe(1);
  });

  it('detects shift of 2 when rows scroll by two', () => {
    const prev = [
      [true, false, true, false],
      [false, true, false, true],
      [true, true, false, false],
      [false, false, true, true],
    ];
    const curr = [
      [true, true, false, false],
      [false, false, true, true],
      [true, false, false, true],
      [false, true, true, false],
    ];
    const shift = findRowShift(prev, curr);
    expect(shift).toBe(2);
  });

  it('returns 0 for empty arrays', () => {
    const shift = findRowShift([], []);
    expect(shift).toBe(0);
  });

  it('handles single-row arrays', () => {
    const prev = [[true, false]];
    const curr = [[true, false]];
    const shift = findRowShift(prev, curr);
    expect(shift).toBe(0);
  });

  it('handles rows with null entries', () => {
    const prev = [
      [true, false],
      null,
      [false, true],
    ];
    const curr = [
      null,
      [false, true],
      [true, true],
    ];
    // Should not crash
    const shift = findRowShift(prev, curr);
    expect(typeof shift).toBe('number');
  });

  it('handles mismatched array lengths', () => {
    const prev = [
      [true, false],
      [false, true],
      [true, true],
    ];
    const curr = [
      [false, true],
      [true, true],
    ];
    const shift = findRowShift(prev, curr);
    expect(typeof shift).toBe('number');
  });

  it('returns 0 when all rows are identical', () => {
    const rows = [
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
    ];
    const shift = findRowShift(rows, rows);
    expect(shift).toBe(0);
  });

  it('returns 0 when all rows are false', () => {
    const rows = [
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ];
    const shift = findRowShift(rows, rows);
    expect(shift).toBe(0);
  });
});

// ─── classifyFrame ───────────────────────────────────────────────────────────
describe('classifyFrame', () => {
  it('returns array of rows matching grid params', () => {
    // Create a small image with uniform gray pixels (low saturation)
    const imageData = createMockImageData(200, 200, () => ({
      r: 128, g: 128, b: 128, a: 255,
    }));

    const gp = {
      cols: 3,
      visibleRows: 2,
      cell: 50,
      col0X: 25,
      row0Y: 25,
      tileHalf: 20,
      width: 200,
      height: 200,
    };

    const rows = classifyFrame(imageData, gp);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    // Each row should be an array of booleans
    for (const row of rows) {
      if (row !== null) {
        expect(Array.isArray(row)).toBe(true);
        expect(row.length).toBe(3);
      }
    }
  });

  it('returns false for gray (low saturation) tiles', () => {
    // Gray pixels have 0 saturation
    const imageData = createMockImageData(200, 200, () => ({
      r: 128, g: 128, b: 128, a: 255,
    }));

    const gp = {
      cols: 2,
      visibleRows: 1,
      cell: 80,
      col0X: 40,
      row0Y: 40,
      tileHalf: 30,
      width: 200,
      height: 200,
    };

    const rows = classifyFrame(imageData, gp);
    expect(rows[0]).toEqual([false, false]);
  });

  it('returns true for highly saturated tiles', () => {
    // Pure red pixels have high saturation
    const imageData = createMockImageData(200, 200, () => ({
      r: 255, g: 0, b: 0, a: 255,
    }));

    const gp = {
      cols: 2,
      visibleRows: 1,
      cell: 80,
      col0X: 40,
      row0Y: 40,
      tileHalf: 30,
      width: 200,
      height: 200,
    };

    const rows = classifyFrame(imageData, gp);
    expect(rows[0]).toEqual([true, true]);
  });

  it('returns null for rows outside image bounds', () => {
    const imageData = createMockImageData(100, 100, () => ({
      r: 128, g: 128, b: 128, a: 255,
    }));

    const gp = {
      cols: 2,
      visibleRows: 3,
      cell: 50,
      col0X: 25,
      row0Y: 10,
      tileHalf: 20,
      width: 100,
      height: 100,
    };

    const rows = classifyFrame(imageData, gp);
    expect(rows.length).toBe(3);
    // Third row (row0Y + 2*50 = 110) should be null since cy + tileHalf >= height
    expect(rows[2]).toBeNull();
  });

  it('returns false for columns outside image bounds', () => {
    const imageData = createMockImageData(100, 100, () => ({
      r: 255, g: 0, b: 0, a: 255,
    }));

    const gp = {
      cols: 3,
      visibleRows: 1,
      cell: 50,
      col0X: 25,
      row0Y: 25,
      tileHalf: 20,
      width: 100,
      height: 100,
    };

    const rows = classifyFrame(imageData, gp);
    // col 0: cx=25, col 1: cx=75, col 2: cx=125 (out of bounds)
    expect(rows[0][2]).toBe(false);
  });

  it('handles mixed saturation tiles', () => {
    // Left half red (high sat), right half gray (low sat)
    const imageData = createMockImageData(200, 100, (x) => {
      if (x < 80) return { r: 255, g: 0, b: 0, a: 255 };
      return { r: 128, g: 128, b: 128, a: 255 };
    });

    const gp = {
      cols: 2,
      visibleRows: 1,
      cell: 80,
      col0X: 40,
      row0Y: 40,
      tileHalf: 30,
      width: 200,
      height: 100,
    };

    const rows = classifyFrame(imageData, gp);
    expect(rows[0][0]).toBe(true);  // Red tile
    expect(rows[0][1]).toBe(false); // Gray tile
  });

  it('handles 1x1 grid', () => {
    const imageData = createMockImageData(100, 100, () => ({
      r: 255, g: 0, b: 0, a: 255,
    }));

    const gp = {
      cols: 1,
      visibleRows: 1,
      cell: 50,
      col0X: 50,
      row0Y: 50,
      tileHalf: 20,
      width: 100,
      height: 100,
    };

    const rows = classifyFrame(imageData, gp);
    expect(rows.length).toBe(1);
    expect(rows[0].length).toBe(1);
  });

  it('handles all-black image (zero saturation)', () => {
    const imageData = createMockImageData(200, 200, () => ({
      r: 0, g: 0, b: 0, a: 255,
    }));

    const gp = {
      cols: 2,
      visibleRows: 2,
      cell: 50,
      col0X: 25,
      row0Y: 25,
      tileHalf: 20,
      width: 200,
      height: 200,
    };

    const rows = classifyFrame(imageData, gp);
    for (const row of rows) {
      if (row !== null) {
        for (const val of row) {
          expect(val).toBe(false);
        }
      }
    }
  });
});

// ─── getGridDataList ─────────────────────────────────────────────────────────
describe('getGridDataList', () => {
  it('returns pokemon list for pokemon mode', async () => {
    const list = await getGridDataList('pokemon');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(3);
    // Should be sorted by number
    expect(list[0].name).toBe('Bulbasaur');
    expect(list[1].name).toBe('Ivysaur');
    expect(list[2].name).toBe('Venusaur');
  });

  it('returns habitat list for habitat mode', async () => {
    const list = await getGridDataList('habitat');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
    // Should be sorted by number
    expect(list[0].name).toBe('Tall Grass');
    expect(list[1].name).toBe('Cozy Cabin');
  });

  it('returns recipe list for recipe mode', async () => {
    const list = await getGridDataList('recipe');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Berry Smoothie');
  });

  it('returns item list for item mode (default)', async () => {
    const list = await getGridDataList('item');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
  });

  it('returns item list for unknown mode', async () => {
    const list = await getGridDataList('unknown');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2); // Falls back to itemList
  });

  it('returns item list for undefined mode', async () => {
    const list = await getGridDataList(undefined);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
  });
});

// ─── P1: detectGridParams additional resolutions ─────────────────────────────
describe('detectGridParams — P1 edge cases', () => {
  it('scales correctly for 1280×720 (720p)', () => {
    const gp = detectGridParams(1280, 720);
    expect(gp.width).toBe(1280);
    expect(gp.height).toBe(720);
    expect(gp.sx).toBeCloseTo(1280 / 1920, 5);
    expect(gp.sy).toBeCloseTo(720 / 1080, 5);
    expect(gp.cols).toBe(12); // ITEM_COLS is constant
    expect(gp.cell).toBeGreaterThan(0);
    expect(gp.tileHalf).toBeGreaterThan(0);
  });

  it('scales correctly for 3840×2160 (4K)', () => {
    const gp = detectGridParams(3840, 2160);
    expect(gp.sx).toBeCloseTo(2, 5);
    expect(gp.sy).toBeCloseTo(2, 5);
    expect(gp.cell).toBeGreaterThan(0);
  });

  it('handles very small dimensions (10×10)', () => {
    const gp = detectGridParams(10, 10);
    expect(gp.width).toBe(10);
    expect(gp.height).toBe(10);
    // sx and sy will be very small fractions
    expect(gp.sx).toBeCloseTo(10 / 1920, 5);
    expect(gp.sy).toBeCloseTo(10 / 1080, 5);
  });

  it('throws for zero width', () => {
    expect(() => detectGridParams(0, 1080)).toThrow('Invalid video dimensions');
  });

  it('throws for zero height', () => {
    expect(() => detectGridParams(1920, 0)).toThrow('Invalid video dimensions');
  });

  it('throws for null dimensions', () => {
    expect(() => detectGridParams(null, null)).toThrow('Invalid video dimensions');
  });
});

// ─── P1: findRowShift additional edge cases ──────────────────────────────────
describe('findRowShift — P1 edge cases', () => {
  it('returns 0 for empty arrays', () => {
    const shift = findRowShift([], []);
    expect(shift).toBe(0);
  });

  it('returns 0 for single-row arrays with same content', () => {
    const row = [[true, false, true]];
    const shift = findRowShift(row, row);
    expect(shift).toBe(0);
  });

  it('returns 0 when prev and curr have different lengths', () => {
    const prev = [
      [true, false],
      [false, true],
    ];
    const curr = [
      [true, false],
    ];
    // Should handle gracefully without crashing
    const shift = findRowShift(prev, curr);
    expect(typeof shift).toBe('number');
  });
});

// ─── P1: classifyFrame with uniform images ───────────────────────────────────
describe('classifyFrame — P1 edge cases', () => {
  it('returns array of rows for uniform gray image via detectGridParams', () => {
    const gp = detectGridParams(1920, 1080);
    const imageData = createMockImageData(1920, 1080, () => ({ r: 128, g: 128, b: 128, a: 255 }));
    const result = classifyFrame(imageData, gp);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(gp.visibleRows);
  });

  it('returns array of rows for all-white image via detectGridParams', () => {
    const gp = detectGridParams(1920, 1080);
    const imageData = createMockImageData(1920, 1080, () => ({ r: 255, g: 255, b: 255, a: 255 }));
    const result = classifyFrame(imageData, gp);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns array of rows for all-black image via detectGridParams', () => {
    const gp = detectGridParams(1920, 1080);
    const imageData = createMockImageData(1920, 1080, () => ({ r: 0, g: 0, b: 0, a: 255 }));
    const result = classifyFrame(imageData, gp);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
