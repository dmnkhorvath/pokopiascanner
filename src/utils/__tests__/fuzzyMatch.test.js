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
