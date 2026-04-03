/**
 * Scan Diff Engine
 * Compares two scan result sets and produces a diff showing what's new.
 */

const CATEGORIES = ['pokemon', 'items', 'habitats', 'recipes'];

/**
 * Extract a Set of lowercase item names from a category's items array.
 * @param {Array} items - Array of item objects or strings
 * @returns {Set<string>}
 */
function extractNames(items) {
  const names = new Set();
  if (!Array.isArray(items)) return names;
  for (const item of items) {
    const name = typeof item === 'string' ? item : item?.name;
    if (name) names.add(name.toLowerCase());
  }
  return names;
}

/**
 * Compare two scan result sets and produce a diff.
 *
 * @param {Object|null|undefined} previousResults - The previous scan results
 * @param {Object|null|undefined} currentResults - The current scan results
 * @returns {Object} Diff object with newItems, totalNew, counts, and byCategory breakdown
 */
export function computeScanDiff(previousResults, currentResults) {
  const result = {
    newItems: { pokemon: [], items: [], habitats: [], recipes: [] },
    totalNew: 0,
    previousTotal: 0,
    currentTotal: 0,
    byCategory: {},
  };

  // Handle null/undefined current results
  if (!currentResults) return result;

  for (const cat of CATEGORIES) {
    const prevCat = previousResults?.[cat];
    const currCat = currentResults[cat];

    const prevItems = prevCat?.items || [];
    const currItems = currCat?.items || [];

    const prevNames = extractNames(prevItems);
    const prevCount = prevItems.length;
    const currCount = currItems.length;

    // Find new items: in current but not in previous
    const newItems = [];
    for (const item of currItems) {
      const name = typeof item === 'string' ? item : item?.name;
      if (name && !prevNames.has(name.toLowerCase())) {
        newItems.push(item);
      }
    }

    result.newItems[cat] = newItems;
    result.previousTotal += prevCount;
    result.currentTotal += currCount;
    result.totalNew += newItems.length;

    result.byCategory[cat] = {
      previous: prevCount,
      current: currCount,
      new: newItems.length,
    };
  }

  return result;
}

/**
 * Build a Set of new item names (lowercase) from a diff result for quick lookup.
 * @param {Object} diff - The diff object from computeScanDiff
 * @returns {Set<string>} Set of lowercase new item names
 */
export function buildNewItemSet(diff) {
  const names = new Set();
  if (!diff?.newItems) return names;
  for (const cat of CATEGORIES) {
    const items = diff.newItems[cat];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const name = typeof item === 'string' ? item : item?.name;
      if (name) names.add(name.toLowerCase());
    }
  }
  return names;
}
