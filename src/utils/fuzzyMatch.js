/**
 * Fuzzy matching utility using Levenshtein distance.
 * Pre-builds a lookup structure for efficient matching.
 */

/**
 * Calculate Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use single array optimization
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/**
 * Build a fuzzy lookup structure from the OCR lookup dictionary.
 * Groups keys by their lowercase first 2 characters for fast prefix lookup.
 * @param {Object} ocrLookup - The OCR lookup dictionary
 * @returns {Object} Lookup structure with methods
 */
export function buildFuzzyMatcher(ocrLookup) {
  const keys = Object.keys(ocrLookup);
  const lowerKeys = keys.map(k => k.toLowerCase());

  // Build prefix index (first 2 chars) for faster searching
  const prefixIndex = {};
  for (let i = 0; i < keys.length; i++) {
    const lower = lowerKeys[i];
    const prefix = lower.substring(0, 2);
    if (!prefixIndex[prefix]) prefixIndex[prefix] = [];
    prefixIndex[prefix].push(i);
    // Also index single char prefix for short strings
    const p1 = lower[0];
    if (!prefixIndex[p1]) prefixIndex[p1] = [];
    prefixIndex[p1].push(i);
  }

  return {
    /**
     * Find exact match (case-insensitive)
     * @param {string} text
     * @returns {Object|null}
     */
    exactMatch(text) {
      const lower = text.toLowerCase().trim();
      for (let i = 0; i < lowerKeys.length; i++) {
        if (lowerKeys[i] === lower) {
          return ocrLookup[keys[i]];
        }
      }
      return null;
    },

    /**
     * Find best fuzzy match within tolerance
     * @param {string} text
     * @param {number} maxDistance - Maximum Levenshtein distance (default 2)
     * @returns {{ match: Object, key: string, distance: number } | null}
     */
    fuzzyMatch(text, maxDistance = 2) {
      const lower = text.toLowerCase().trim();
      if (lower.length < 2) return null;

      let bestMatch = null;
      let bestDistance = maxDistance + 1;
      let bestKey = null;

      // Try prefix-based candidates first
      const prefix = lower.substring(0, 2);
      const candidates = new Set();

      // Add candidates from 2-char prefix
      if (prefixIndex[prefix]) {
        prefixIndex[prefix].forEach(i => candidates.add(i));
      }
      // Add candidates from 1-char prefix
      if (prefixIndex[lower[0]]) {
        prefixIndex[lower[0]].forEach(i => candidates.add(i));
      }

      // If we have prefix candidates, search those first
      if (candidates.size > 0) {
        for (const i of candidates) {
          // Quick length check - if lengths differ by more than maxDistance, skip
          if (Math.abs(lowerKeys[i].length - lower.length) > maxDistance) continue;
          const dist = levenshtein(lower, lowerKeys[i]);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestMatch = ocrLookup[keys[i]];
            bestKey = keys[i];
            if (dist === 0) break; // Exact match found
          }
        }
      }

      // If no good match from prefix, do full scan for short texts
      if (bestDistance > maxDistance && lower.length <= 15) {
        for (let i = 0; i < lowerKeys.length; i++) {
          if (Math.abs(lowerKeys[i].length - lower.length) > maxDistance) continue;
          const dist = levenshtein(lower, lowerKeys[i]);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestMatch = ocrLookup[keys[i]];
            bestKey = keys[i];
            if (dist === 0) break;
          }
        }
      }

      if (bestDistance <= maxDistance && bestMatch) {
        return { match: bestMatch, key: bestKey, distance: bestDistance };
      }
      return null;
    },

    /**
     * Try exact match first, then fuzzy match
     * @param {string} text
     * @param {number} maxDistance
     * @returns {Object|null} The matched item from ocrLookup or null
     */
    findMatch(text, maxDistance = 2) {
      const exact = this.exactMatch(text);
      if (exact) return exact;
      const fuzzy = this.fuzzyMatch(text, maxDistance);
      return fuzzy ? fuzzy.match : null;
    }
  };
}
