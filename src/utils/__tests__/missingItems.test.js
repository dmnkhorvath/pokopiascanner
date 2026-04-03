import { describe, it, expect } from 'vitest';
import { getMissingItems, getMissingStats, getClosestToCompletion, getWikiUrl, getIconPath } from '../missingItems.js';

// Mock dataset for testing
const mockDataset = {
  metadata: { counts: { pokemon: 5, items: 4, habitats: 3, recipes: 3 } },
  pokemon: [
    { number: '#001', name: 'Bulbasaur', species: 'Seed Pokémon' },
    { number: '#002', name: 'Ivysaur', species: 'Seed Pokémon' },
    { number: '#003', name: 'Venusaur', species: 'Seed Pokémon' },
    { number: '#004', name: 'Charmander', species: 'Lizard Pokémon' },
    { number: '#005', name: 'Charmeleon', species: 'Flame Pokémon' },
  ],
  items: [
    { name: 'Leppa Berry', category: 'Food' },
    { name: 'Potion', category: 'Medicine' },
    { name: 'Stone', category: 'Material' },
    { name: 'Honey', category: 'Food' },
  ],
  habitats: [
    { number: '001', name: 'Tall grass' },
    { number: '002', name: 'Campsite' },
    { number: '003', name: 'Beach set' },
  ],
  recipes: [
    { name: 'Storage box', category: 'Furniture' },
    { name: 'Simple bread', category: 'Cooking' },
    { name: 'Berry Juice', category: 'Cooking' },
  ],
};

// Helper to build scan results
function makeResults(pokemon = [], items = [], habitats = [], recipes = []) {
  return {
    totalFound: pokemon.length + items.length + habitats.length + recipes.length,
    pokemon: { found: pokemon.length, total: 5, items: pokemon },
    items: { found: items.length, total: 4, items: items },
    habitats: { found: habitats.length, total: 3, items: habitats },
    recipes: { found: recipes.length, total: 3, items: recipes },
  };
}

describe('getMissingItems', () => {
  it('returns all items as missing when scanResults is null', () => {
    const missing = getMissingItems(null, mockDataset);
    expect(missing.pokemon).toHaveLength(5);
    expect(missing.items).toHaveLength(4);
    expect(missing.habitats).toHaveLength(3);
    expect(missing.recipes).toHaveLength(3);
  });

  it('returns nothing missing when all items are found', () => {
    const results = makeResults(
      [{ name: 'Bulbasaur' }, { name: 'Ivysaur' }, { name: 'Venusaur' }, { name: 'Charmander' }, { name: 'Charmeleon' }],
      [{ name: 'Leppa Berry' }, { name: 'Potion' }, { name: 'Stone' }, { name: 'Honey' }],
      [{ name: 'Tall grass' }, { name: 'Campsite' }, { name: 'Beach set' }],
      [{ name: 'Storage box' }, { name: 'Simple bread' }, { name: 'Berry Juice' }],
    );
    const missing = getMissingItems(results, mockDataset);
    expect(missing.pokemon).toHaveLength(0);
    expect(missing.items).toHaveLength(0);
    expect(missing.habitats).toHaveLength(0);
    expect(missing.recipes).toHaveLength(0);
  });

  it('correctly identifies partial missing items', () => {
    const results = makeResults(
      [{ name: 'Bulbasaur' }, { name: 'Charmander' }],
      [{ name: 'Potion' }],
      [{ name: 'Campsite' }],
      [{ name: 'Berry Juice' }],
    );
    const missing = getMissingItems(results, mockDataset);
    expect(missing.pokemon).toHaveLength(3);
    expect(missing.pokemon.map(p => p.name)).toEqual(['Ivysaur', 'Venusaur', 'Charmeleon']);
    expect(missing.items).toHaveLength(3);
    expect(missing.items.map(i => i.name)).toEqual(['Leppa Berry', 'Stone', 'Honey']);
    expect(missing.habitats).toHaveLength(2);
    expect(missing.habitats.map(h => h.name)).toEqual(['Tall grass', 'Beach set']);
    expect(missing.recipes).toHaveLength(2);
    expect(missing.recipes.map(r => r.name)).toEqual(['Storage box', 'Simple bread']);
  });

  it('handles case-insensitive matching', () => {
    const results = makeResults(
      [{ name: 'bulbasaur' }, { name: 'CHARMANDER' }],
      [],
      [],
      [],
    );
    const missing = getMissingItems(results, mockDataset);
    expect(missing.pokemon).toHaveLength(3);
    expect(missing.pokemon.map(p => p.name)).toEqual(['Ivysaur', 'Venusaur', 'Charmeleon']);
  });

  it('returns empty arrays when dataset is null', () => {
    const missing = getMissingItems(null, null);
    expect(missing.pokemon).toHaveLength(0);
    expect(missing.items).toHaveLength(0);
    expect(missing.habitats).toHaveLength(0);
    expect(missing.recipes).toHaveLength(0);
  });

  it('handles scan results with string items (legacy format)', () => {
    const results = makeResults(
      [],
      [],
      [],
      [],
    );
    // Override with string-based items
    results.pokemon.items = ['Bulbasaur', 'Ivysaur'];
    results.pokemon.found = 2;
    const missing = getMissingItems(results, mockDataset);
    expect(missing.pokemon).toHaveLength(3);
  });

  it('preserves original dataset metadata in missing items', () => {
    const results = makeResults(
      [{ name: 'Bulbasaur' }],
      [],
      [],
      [],
    );
    const missing = getMissingItems(results, mockDataset);
    const ivysaur = missing.pokemon.find(p => p.name === 'Ivysaur');
    expect(ivysaur).toBeDefined();
    expect(ivysaur.number).toBe('#002');
    expect(ivysaur.species).toBe('Seed Pokémon');
  });

  it('handles empty scan results object', () => {
    const results = {};
    const missing = getMissingItems(results, mockDataset);
    expect(missing.pokemon).toHaveLength(5);
    expect(missing.items).toHaveLength(4);
  });
});

describe('getMissingStats', () => {
  it('returns correct stats for partial results', () => {
    const results = makeResults(
      [{ name: 'Bulbasaur' }, { name: 'Charmander' }],
      [{ name: 'Potion' }],
      [],
      [{ name: 'Berry Juice' }, { name: 'Simple bread' }, { name: 'Storage box' }],
    );
    const stats = getMissingStats(results, mockDataset);
    expect(stats.pokemon).toEqual({ missing: 3, total: 5, found: 2 });
    expect(stats.items).toEqual({ missing: 3, total: 4, found: 1 });
    expect(stats.habitats).toEqual({ missing: 3, total: 3, found: 0 });
    expect(stats.recipes).toEqual({ missing: 0, total: 3, found: 3 });
    expect(stats.overall).toEqual({ missing: 9, total: 15, found: 6 });
  });

  it('returns all zeros when dataset is null', () => {
    const stats = getMissingStats(null, null);
    expect(stats.pokemon).toEqual({ missing: 0, total: 0, found: 0 });
    expect(stats.overall).toEqual({ missing: 0, total: 0, found: 0 });
  });

  it('returns all missing when scanResults is null', () => {
    const stats = getMissingStats(null, mockDataset);
    expect(stats.overall.missing).toBe(15);
    expect(stats.overall.found).toBe(0);
    expect(stats.overall.total).toBe(15);
  });
});

describe('getClosestToCompletion', () => {
  it('finds the category with fewest missing items', () => {
    const stats = {
      pokemon: { missing: 10, total: 300, found: 290 },
      items: { missing: 50, total: 1254, found: 1204 },
      habitats: { missing: 3, total: 209, found: 206 },
      recipes: { missing: 20, total: 743, found: 723 },
    };
    const closest = getClosestToCompletion(stats);
    expect(closest.category).toBe('habitats');
    expect(closest.missing).toBe(3);
    expect(closest.label).toBe('Habitats');
  });

  it('returns null when all categories are complete', () => {
    const stats = {
      pokemon: { missing: 0, total: 5, found: 5 },
      items: { missing: 0, total: 4, found: 4 },
      habitats: { missing: 0, total: 3, found: 3 },
      recipes: { missing: 0, total: 3, found: 3 },
    };
    const closest = getClosestToCompletion(stats);
    expect(closest).toBeNull();
  });

  it('skips categories with zero total', () => {
    const stats = {
      pokemon: { missing: 0, total: 0, found: 0 },
      items: { missing: 5, total: 10, found: 5 },
      habitats: { missing: 2, total: 10, found: 8 },
      recipes: { missing: 0, total: 0, found: 0 },
    };
    const closest = getClosestToCompletion(stats);
    expect(closest.category).toBe('habitats');
  });
});

describe('getWikiUrl', () => {
  it('encodes item names correctly', () => {
    expect(getWikiUrl('Leppa Berry')).toBe('https://pokopiadex.com/search?q=Leppa%20Berry');
  });

  it('handles special characters', () => {
    expect(getWikiUrl('Moomoo Milk & Honey')).toBe('https://pokopiadex.com/search?q=Moomoo%20Milk%20%26%20Honey');
  });
});

describe('getIconPath', () => {
  it('resolves pokemon icon path from name', () => {
    const path = getIconPath({ name: 'Bulbasaur' }, 'pokemon');
    expect(path).toBe('icons/pokemon/bulbasaur.webp');
  });

  it('handles pokemon names with spaces', () => {
    const path = getIconPath({ name: 'Mr. Mime' }, 'pokemon');
    expect(path).toBe('icons/pokemon/mr-mime.webp');
  });

  it('resolves habitat icon path with number', () => {
    const path = getIconPath({ name: 'Tall grass', number: '001' }, 'habitats');
    expect(path).toBe('icons/habitats/tall-grass-001.webp');
  });

  it('resolves item icon path from icon map', () => {
    const iconMap = { 'Leppa Berry': 'dream_ui/leppa-berry.webp' };
    const path = getIconPath({ name: 'Leppa Berry' }, 'items', iconMap);
    expect(path).toBe('icons/items/dream_ui/leppa-berry.webp');
  });

  it('returns null for items without icon map', () => {
    const path = getIconPath({ name: 'Leppa Berry' }, 'items');
    expect(path).toBeNull();
  });

  it('returns null for items not in icon map', () => {
    const iconMap = { 'Potion': 'item_ui/potion.webp' };
    const path = getIconPath({ name: 'Unknown Item' }, 'items', iconMap);
    expect(path).toBeNull();
  });
});
