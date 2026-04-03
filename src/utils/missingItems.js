/**
 * Missing Items Utility
 * Computes which items from the full dataset are NOT present in scan results.
 * Used by the Missing Item Helper feature.
 */

import pokopiaDataset from '../assets/pokopiaDataset.json';

const CATEGORIES = ['pokemon', 'items', 'habitats', 'recipes'];

/**
 * Get all items from the dataset that are NOT found in scan results.
 * @param {Object|null} scanResults - The scan results object from ocrEngine
 * @param {Object} [dataset] - Optional dataset override (for testing)
 * @returns {Object} Missing items by category: { pokemon: [...], items: [...], habitats: [...], recipes: [...] }
 */
export function getMissingItems(scanResults, dataset = pokopiaDataset) {
  if (!dataset) return { pokemon: [], items: [], habitats: [], recipes: [] };

  const result = {};

  for (const category of CATEGORIES) {
    const allItems = dataset[category] || [];
    const foundItems = scanResults?.[category]?.items || [];

    // Build a Set of found item names (lowercase for case-insensitive comparison)
    const foundNames = new Set(
      foundItems.map(item => (typeof item === 'string' ? item : item.name || '').toLowerCase().trim())
    );

    // Filter dataset items not in found set
    result[category] = allItems.filter(item => {
      const name = (item.name || '').toLowerCase().trim();
      return name && !foundNames.has(name);
    });
  }

  return result;
}

/**
 * Get summary statistics for missing items per category.
 * @param {Object|null} scanResults - The scan results object
 * @param {Object} [dataset] - Optional dataset override (for testing)
 * @returns {Object} Stats per category: { pokemon: { missing, total, found }, ... , overall: { missing, total, found } }
 */
export function getMissingStats(scanResults, dataset = pokopiaDataset) {
  if (!dataset) {
    const empty = { missing: 0, total: 0, found: 0 };
    return { pokemon: { ...empty }, items: { ...empty }, habitats: { ...empty }, recipes: { ...empty }, overall: { ...empty } };
  }

  const missing = getMissingItems(scanResults, dataset);
  const stats = {};
  let totalMissing = 0;
  let totalAll = 0;
  let totalFound = 0;

  for (const category of CATEGORIES) {
    const total = (dataset[category] || []).length;
    const missingCount = missing[category].length;
    const found = total - missingCount;
    stats[category] = { missing: missingCount, total, found };
    totalMissing += missingCount;
    totalAll += total;
    totalFound += found;
  }

  stats.overall = { missing: totalMissing, total: totalAll, found: totalFound };
  return stats;
}

/**
 * Find the category closest to completion (fewest missing items, but not already complete).
 * @param {Object} stats - Stats object from getMissingStats
 * @returns {Object|null} { category, label, missing, total, found, percent } or null if all complete
 */
export function getClosestToCompletion(stats) {
  const LABELS = {
    pokemon: 'Pokémon',
    items: 'Items',
    habitats: 'Habitats',
    recipes: 'Recipes',
  };

  let best = null;

  for (const category of CATEGORIES) {
    const s = stats[category];
    if (!s || s.total === 0 || s.missing === 0) continue; // skip complete or empty
    const percent = Math.round((s.found / s.total) * 100);
    if (!best || s.missing < best.missing) {
      best = { category, label: LABELS[category], ...s, percent };
    }
  }

  return best;
}

/**
 * Build a pokopiadex.com search URL for an item.
 * @param {string} itemName
 * @returns {string}
 */
export function getWikiUrl(itemName) {
  return `https://pokopiadex.com/search?q=${encodeURIComponent(itemName)}`;
}

/**
 * Resolve the icon path for a missing item based on its category.
 * @param {Object} item - The dataset item object
 * @param {string} category - One of: pokemon, items, habitats, recipes
 * @param {Object} [iconMap] - The icon_map.json data (for items/recipes)
 * @returns {string|null} Relative path from public/ or null if not found
 */
export function getIconPath(item, category, iconMap = null) {
  const name = item.name || '';

  if (category === 'pokemon') {
    // Pokemon icons: /icons/pokemon/{name-slug}.webp
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `icons/pokemon/${slug}.webp`;
  }

  if (category === 'habitats') {
    // Habitat icons: /icons/habitats/{name-slug}-{number}.webp
    const num = (item.number || '').replace(/^#?0*/, '') || '000';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const paddedNum = num.padStart(3, '0');
    return `icons/habitats/${slug}-${paddedNum}.webp`;
  }

  if ((category === 'items' || category === 'recipes') && iconMap) {
    // Items/recipes: look up in icon_map.json
    const iconPath = iconMap[name];
    if (iconPath) return `icons/items/${iconPath}`;
  }

  return null;
}
