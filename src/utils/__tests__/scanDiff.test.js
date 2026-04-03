import { describe, it, expect } from 'vitest';
import { computeScanDiff, buildNewItemSet } from '../scanDiff.js';

// Helper to build a results object
function makeResults(pokemon = [], items = [], habitats = [], recipes = []) {
  return {
    totalFound: pokemon.length + items.length + habitats.length + recipes.length,
    pokemon: { found: pokemon.length, total: 300, items: pokemon },
    items: { found: items.length, total: 1254, items: items },
    habitats: { found: habitats.length, total: 209, items: habitats },
    recipes: { found: recipes.length, total: 743, items: recipes },
  };
}

function pokemon(name, captured = true) {
  return { name, number: null, captured };
}

function item(name, discovered = true) {
  return { name, category: 'Furniture', discovered };
}

function habitat(name, built = true) {
  return { name, number: null, built };
}

function recipe(name, discovered = true) {
  return { name, category: 'Cooking', discovered };
}

describe('computeScanDiff', () => {
  it('returns 0 new items when both results are identical', () => {
    const results = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [item('Potion')],
      [habitat('Tall Grass')],
      [recipe('Berry Juice')]
    );
    const diff = computeScanDiff(results, results);
    expect(diff.totalNew).toBe(0);
    expect(diff.newItems.pokemon).toHaveLength(0);
    expect(diff.newItems.items).toHaveLength(0);
    expect(diff.newItems.habitats).toHaveLength(0);
    expect(diff.newItems.recipes).toHaveLength(0);
  });

  it('treats everything as new when previous is null', () => {
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [item('Potion')],
      [habitat('Tall Grass')],
      [recipe('Berry Juice')]
    );
    const diff = computeScanDiff(null, current);
    expect(diff.totalNew).toBe(5);
    expect(diff.newItems.pokemon).toHaveLength(2);
    expect(diff.newItems.items).toHaveLength(1);
    expect(diff.newItems.habitats).toHaveLength(1);
    expect(diff.newItems.recipes).toHaveLength(1);
  });

  it('treats everything as new when previous is undefined', () => {
    const current = makeResults(
      [pokemon('Bulbasaur')],
      [],
      [],
      []
    );
    const diff = computeScanDiff(undefined, current);
    expect(diff.totalNew).toBe(1);
    expect(diff.newItems.pokemon).toHaveLength(1);
    expect(diff.newItems.pokemon[0].name).toBe('Bulbasaur');
  });

  it('detects only additions when current has more items', () => {
    const previous = makeResults(
      [pokemon('Pikachu')],
      [item('Potion')],
      [],
      []
    );
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee'), pokemon('Charmander')],
      [item('Potion'), item('Super Potion')],
      [habitat('Tall Grass')],
      [recipe('Berry Juice')]
    );
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(5);
    expect(diff.newItems.pokemon).toHaveLength(2);
    expect(diff.newItems.items).toHaveLength(1);
    expect(diff.newItems.habitats).toHaveLength(1);
    expect(diff.newItems.recipes).toHaveLength(1);
    expect(diff.byCategory.pokemon.new).toBe(2);
    expect(diff.byCategory.items.new).toBe(1);
  });

  it('performs case-insensitive comparison', () => {
    const previous = makeResults(
      [pokemon('pikachu')],
      [],
      [],
      []
    );
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('EEVEE')],
      [],
      [],
      []
    );
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(1);
    expect(diff.newItems.pokemon).toHaveLength(1);
    expect(diff.newItems.pokemon[0].name).toBe('EEVEE');
  });

  it('handles mixed categories with overlaps correctly', () => {
    const previous = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [item('Potion'), item('Antidote')],
      [habitat('Tall Grass'), habitat('Beach')],
      [recipe('Berry Juice')]
    );
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee'), pokemon('Snorlax')],
      [item('Potion'), item('Antidote'), item('Revive')],
      [habitat('Tall Grass'), habitat('Beach')],
      [recipe('Berry Juice'), recipe('Curry')]
    );
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(3);
    expect(diff.newItems.pokemon.map(p => p.name)).toEqual(['Snorlax']);
    expect(diff.newItems.items.map(i => i.name)).toEqual(['Revive']);
    expect(diff.newItems.habitats).toHaveLength(0);
    expect(diff.newItems.recipes.map(r => r.name)).toEqual(['Curry']);
    expect(diff.previousTotal).toBe(7);
    expect(diff.currentTotal).toBe(10);
  });

  it('returns 0 new items when current results is null', () => {
    const previous = makeResults([pokemon('Pikachu')], [], [], []);
    const diff = computeScanDiff(previous, null);
    expect(diff.totalNew).toBe(0);
    expect(diff.currentTotal).toBe(0);
    expect(diff.previousTotal).toBe(0);
  });

  it('handles empty categories gracefully', () => {
    const previous = makeResults([], [], [], []);
    const current = makeResults([], [], [], []);
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(0);
    expect(diff.previousTotal).toBe(0);
    expect(diff.currentTotal).toBe(0);
    expect(diff.byCategory.pokemon).toEqual({ previous: 0, current: 0, new: 0 });
  });

  it('handles previous with items and current with fewer (no new items)', () => {
    const previous = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee'), pokemon('Snorlax')],
      [],
      [],
      []
    );
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [],
      [],
      []
    );
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(0);
    expect(diff.newItems.pokemon).toHaveLength(0);
  });

  it('handles results with missing category keys', () => {
    const previous = { totalFound: 1, pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu' }] } };
    const current = {
      totalFound: 2,
      pokemon: { found: 1, total: 300, items: [{ name: 'Pikachu' }] },
      items: { found: 1, total: 1254, items: [{ name: 'Potion' }] },
    };
    const diff = computeScanDiff(previous, current);
    expect(diff.totalNew).toBe(1);
    expect(diff.newItems.items).toHaveLength(1);
    expect(diff.newItems.habitats).toHaveLength(0);
    expect(diff.newItems.recipes).toHaveLength(0);
  });

  it('populates byCategory with correct previous/current/new counts', () => {
    const previous = makeResults(
      [pokemon('Pikachu')],
      [item('Potion'), item('Antidote')],
      [],
      [recipe('Berry Juice')]
    );
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [item('Potion'), item('Antidote'), item('Revive')],
      [habitat('Beach')],
      [recipe('Berry Juice')]
    );
    const diff = computeScanDiff(previous, current);
    expect(diff.byCategory.pokemon).toEqual({ previous: 1, current: 2, new: 1 });
    expect(diff.byCategory.items).toEqual({ previous: 2, current: 3, new: 1 });
    expect(diff.byCategory.habitats).toEqual({ previous: 0, current: 1, new: 1 });
    expect(diff.byCategory.recipes).toEqual({ previous: 1, current: 1, new: 0 });
  });
});

describe('buildNewItemSet', () => {
  it('builds a set of lowercase new item names from diff', () => {
    const previous = makeResults([pokemon('Pikachu')], [], [], []);
    const current = makeResults(
      [pokemon('Pikachu'), pokemon('Eevee')],
      [item('Super Potion')],
      [],
      []
    );
    const diff = computeScanDiff(previous, current);
    const newSet = buildNewItemSet(diff);
    expect(newSet.has('eevee')).toBe(true);
    expect(newSet.has('super potion')).toBe(true);
    expect(newSet.has('pikachu')).toBe(false);
    expect(newSet.size).toBe(2);
  });

  it('returns empty set for null diff', () => {
    const newSet = buildNewItemSet(null);
    expect(newSet.size).toBe(0);
  });

  it('returns empty set when no new items', () => {
    const results = makeResults([pokemon('Pikachu')], [], [], []);
    const diff = computeScanDiff(results, results);
    const newSet = buildNewItemSet(diff);
    expect(newSet.size).toBe(0);
  });
});
