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

import { saveSession, loadSession, deleteSession, listSessions, loadLatestSession, estimateStorageUsage } from '../scanStorage.js';

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
