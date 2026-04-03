import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    get _store() { return store; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${++uuidCounter}` });

import { saveSession, loadSession, deleteSession, listSessions, loadLatestSession, estimateStorageUsage, clearAllSessions } from '../scanStorage.js';

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  uuidCounter = 0;
});

const mockResults = {
  totalFound: 5,
  pokemon: { found: 2, total: 300, items: [] },
  items: { found: 1, total: 1254, items: [] },
  habitats: { found: 1, total: 209, items: [] },
  recipes: { found: 1, total: 743, items: [] },
};

describe('saveSession', () => {
  it('saves a new session and returns an id', () => {
    const id = saveSession(mockResults, 1);
    expect(id).toBe('test-uuid-1');
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('updates an existing session by id', () => {
    const id = saveSession(mockResults, 1);
    const id2 = saveSession({ ...mockResults, totalFound: 10 }, 2, id);
    expect(id2).toBe(id);
  });
});

describe('loadSession', () => {
  it('loads a previously saved session', () => {
    const id = saveSession(mockResults, 1);
    const data = loadSession(id);
    expect(data).not.toBeNull();
    expect(data.results.totalFound).toBe(5);
    expect(data.scanCount).toBe(1);
  });

  it('returns null for non-existent session', () => {
    expect(loadSession('nonexistent')).toBeNull();
  });
});

describe('deleteSession', () => {
  it('removes a session', () => {
    const id = saveSession(mockResults, 1);
    deleteSession(id);
    expect(loadSession(id)).toBeNull();
    expect(listSessions().find(s => s.id === id)).toBeUndefined();
  });
});

describe('listSessions', () => {
  it('returns empty array when no sessions', () => {
    expect(listSessions()).toEqual([]);
  });

  it('lists saved sessions sorted by date', () => {
    saveSession(mockResults, 1);
    saveSession({ ...mockResults, totalFound: 10 }, 2);
    const sessions = listSessions();
    expect(sessions.length).toBe(2);
    expect(new Date(sessions[0].date) >= new Date(sessions[1].date)).toBe(true);
  });
});

describe('estimateStorageUsage', () => {
  it('returns a number >= 0', () => {
    saveSession(mockResults, 1);
    const usage = estimateStorageUsage();
    expect(typeof usage).toBe('number');
    expect(usage).toBeGreaterThan(0);
  });
});

// ─── P1: MAX_SESSIONS eviction, QUOTA_EXCEEDED, loadLatestSession, clearAllSessions, corrupted JSON ──
describe('saveSession — P1 edge cases', () => {
  it('evicts oldest sessions when exceeding MAX_SESSIONS (20)', () => {
    const ids = [];
    for (let i = 0; i < 22; i++) {
      ids.push(saveSession({ ...mockResults, totalFound: i }, i + 1));
    }
    const sessions = listSessions();
    expect(sessions.length).toBe(20);
    expect(sessions.find(s => s.id === ids[0])).toBeUndefined();
    expect(sessions.find(s => s.id === ids[1])).toBeUndefined();
    expect(sessions.find(s => s.id === ids[21])).toBeDefined();
  });

  it('returns QUOTA_EXCEEDED for oversized payload (> 4 MB)', () => {
    const hugeResults = {
      ...mockResults,
      pokemon: { found: 1, total: 300, items: [{ name: 'x'.repeat(1500000) }] },
      items: { found: 1, total: 1254, items: [{ name: 'y'.repeat(1500000) }] },
      habitats: { found: 1, total: 209, items: [{ name: 'z'.repeat(1500000) }] },
      recipes: { found: 1, total: 743, items: [] },
    };
    const result = saveSession(hugeResults, 1);
    expect(result).toBe('QUOTA_EXCEEDED');
  });

  it('returns QUOTA_EXCEEDED when localStorage.setItem throws QuotaExceededError', () => {
    localStorageMock.setItem.mockImplementation((key, value) => {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });
    const result = saveSession(mockResults, 1);
    expect(result).toBe('QUOTA_EXCEEDED');
    // Restore original implementation so subsequent tests work
    localStorageMock.setItem.mockImplementation((key, value) => {
      localStorageMock._store[key] = String(value);
    });
  });
});

describe('loadLatestSession — P1', () => {
  it('returns the most recently saved session', () => {
    saveSession(mockResults, 1);
    saveSession({ ...mockResults, totalFound: 99 }, 2);
    const latest = loadLatestSession();
    expect(latest).not.toBeNull();
    expect(latest.results.totalFound).toBe(99);
  });

  it('returns null when no sessions exist', () => {
    expect(loadLatestSession()).toBeNull();
  });
});

describe('clearAllSessions — P1', () => {
  it('removes all sessions and their data', () => {
    saveSession(mockResults, 1);
    saveSession({ ...mockResults, totalFound: 10 }, 2);
    expect(listSessions().length).toBe(2);
    clearAllSessions();
    expect(listSessions()).toEqual([]);
  });
});

describe('listSessions — P1 corrupted data', () => {
  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorageMock._store['pokopia-scan-sessions'] = '{invalid json!!!';
    expect(listSessions()).toEqual([]);
  });

  it('returns empty array when localStorage contains non-array JSON', () => {
    localStorageMock._store['pokopia-scan-sessions'] = '"just a string"';
    expect(listSessions()).toEqual([]);
  });
});

describe('estimateStorageUsage — P1 additional', () => {
  it('returns 0 when no pokopia keys exist', () => {
    const usage = estimateStorageUsage();
    expect(usage).toBe(0);
  });

  it('increases after saving sessions', () => {
    const before = estimateStorageUsage();
    saveSession(mockResults, 1);
    const after = estimateStorageUsage();
    expect(after).toBeGreaterThan(before);
  });
});
