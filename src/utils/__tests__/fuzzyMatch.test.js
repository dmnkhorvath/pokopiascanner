import { describe, it, expect } from 'vitest';
import { levenshtein, buildFuzzyMatcher } from '../fuzzyMatch.js';

const mockLookup = {
  'Pikachu': { type: 'pokemon', number: '#025' },
  'Bulbasaur': { type: 'pokemon', number: '#001' },
  'Tall Grass': { type: 'habitat', number: '1' },
  'Potion': { type: 'item', category: 'Medicine' },
  'Berry Smoothie': { type: 'recipe', category: 'Drinks' },
};

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('buildFuzzyMatcher', () => {
  const matcher = buildFuzzyMatcher(mockLookup);

  it('finds exact match (case-insensitive)', () => {
    const result = matcher.exactMatch('pikachu');
    expect(result).toEqual({ type: 'pokemon', number: '#025' });
  });

  it('returns null for no exact match', () => {
    expect(matcher.exactMatch('Pikachuuu')).toBeNull();
  });

  it('finds fuzzy match within tolerance', () => {
    const result = matcher.fuzzyMatch('Pikachv', 2);
    expect(result).not.toBeNull();
    expect(result.key).toBe('Pikachu');
    expect(result.distance).toBeLessThanOrEqual(2);
  });

  it('returns null for fuzzy match beyond tolerance', () => {
    const result = matcher.fuzzyMatch('XXXXXXX', 1);
    expect(result).toBeNull();
  });

  it('findMatch prefers exact over fuzzy', () => {
    const result = matcher.findMatch('Potion', 2);
    expect(result).toEqual({ type: 'item', category: 'Medicine' });
  });

  it('findMatch falls back to fuzzy', () => {
    const result = matcher.findMatch('Potlon', 2);
    expect(result).not.toBeNull();
    expect(result.type).toBe('item');
  });
});

// ─── P1: Prefix index edge cases, null guard, special inputs ─────────────────
describe('buildFuzzyMatcher — P1 edge cases', () => {
  it('returns safe no-op matcher for null ocrLookup', () => {
    const matcher = buildFuzzyMatcher(null);
    expect(matcher.findMatch('Pikachu')).toBeNull();
    expect(matcher.exactMatch('Pikachu')).toBeNull();
    expect(matcher.fuzzyMatch('Pikachu')).toBeNull();
  });

  it('returns safe no-op matcher for undefined ocrLookup', () => {
    const matcher = buildFuzzyMatcher(undefined);
    expect(matcher.findMatch('anything')).toBeNull();
  });

  it('returns safe no-op matcher for non-object ocrLookup', () => {
    const matcher = buildFuzzyMatcher('not an object');
    expect(matcher.findMatch('test')).toBeNull();
  });

  it('returns null for all methods with empty object lookup', () => {
    const matcher = buildFuzzyMatcher({});
    expect(matcher.exactMatch('Pikachu')).toBeNull();
    expect(matcher.fuzzyMatch('Pikachu', 2)).toBeNull();
    expect(matcher.findMatch('Pikachu', 2)).toBeNull();
  });

  it('fuzzyMatch returns null for single-char input (length < 2 guard)', () => {
    const matcher = buildFuzzyMatcher(mockLookup);
    expect(matcher.fuzzyMatch('P', 2)).toBeNull();
  });

  it('handles very long input string without crashing', () => {
    const matcher = buildFuzzyMatcher(mockLookup);
    const longStr = 'A'.repeat(10000);
    expect(matcher.exactMatch(longStr)).toBeNull();
    expect(matcher.fuzzyMatch(longStr, 2)).toBeNull();
    expect(matcher.findMatch(longStr, 2)).toBeNull();
  });

  it('handles unicode and special characters gracefully', () => {
    const matcher = buildFuzzyMatcher(mockLookup);
    expect(matcher.exactMatch('Pikach\u00fc')).toBeNull();
    // distance 1 from Pikachu — should fuzzy match
    const fuzzyResult = matcher.fuzzyMatch('Pikach\u00fc', 2);
    expect(fuzzyResult).not.toBeNull();
    expect(matcher.findMatch('\u65e5\u672c\u8a9e\u30c6\u30b9\u30c8', 2)).toBeNull();
  });

  it('maxDistance=0 in fuzzyMatch only matches exact spelling', () => {
    const matcher = buildFuzzyMatcher(mockLookup);
    const exact = matcher.fuzzyMatch('Pikachu', 0);
    expect(exact).not.toBeNull();
    expect(exact.distance).toBe(0);
    const oneOff = matcher.fuzzyMatch('Pikachv', 0);
    expect(oneOff).toBeNull();
  });
});

describe('levenshtein — P1 additional cases', () => {
  it('handles two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('handles multi-byte unicode characters', () => {
    expect(levenshtein('caf\u00e9', 'cafe')).toBe(1);
  });
});
