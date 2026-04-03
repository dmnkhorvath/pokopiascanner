/**
 * localStorage persistence for scan results.
 * Stores sessions with timestamps, supports merge and history.
 */

const STORAGE_KEY = 'pokopia-scan-sessions';
const CURRENT_KEY = 'pokopia-current-session';

/**
 * Get all saved sessions (metadata only, sorted newest first)
 * @returns {Array<{id, date, totalFound, scanCount, categories}>}
 */
export function listSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}

/**
 * Save or update the current session
 * @param {Object} results - The scan results object
 * @param {number} scanCount - Number of scans in this session
 * @param {string|null} sessionId - Existing session ID to update, or null for new
 * @returns {string} The session ID
 */
export function saveSession(results, scanCount, sessionId = null) {
  try {
    const sessions = listSessions();
    const id = sessionId || crypto.randomUUID();
    const now = new Date().toISOString();

    const summary = {
      id,
      date: now,
      totalFound: results?.totalFound || 0,
      scanCount,
      categories: {
        pokemon: results?.pokemon?.found || 0,
        items: results?.items?.found || 0,
        habitats: results?.habitats?.found || 0,
        recipes: results?.recipes?.found || 0,
      },
    };

    // Update existing or add new
    const idx = sessions.findIndex(s => s.id === id);
    if (idx >= 0) {
      sessions[idx] = summary;
    } else {
      sessions.unshift(summary);
    }

    // Keep max 20 sessions
    const trimmed = sessions.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    // Save full results for current session
    localStorage.setItem(`${CURRENT_KEY}-${id}`, JSON.stringify({
      results,
      scanCount,
      savedAt: now,
    }));

    return id;
  } catch (e) {
    console.warn('Failed to save session:', e);
    return null;
  }
}

/**
 * Load a session's full results by ID
 * @param {string} sessionId
 * @returns {{results, scanCount, savedAt}|null}
 */
export function loadSession(sessionId) {
  try {
    const raw = localStorage.getItem(`${CURRENT_KEY}-${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load the most recent session
 * @returns {{id, results, scanCount, savedAt}|null}
 */
export function loadLatestSession() {
  const sessions = listSessions();
  if (sessions.length === 0) return null;
  const latest = sessions[0];
  const data = loadSession(latest.id);
  if (!data) return null;
  return { id: latest.id, ...data };
}

/**
 * Delete a session by ID
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  try {
    const sessions = listSessions().filter(s => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    localStorage.removeItem(`${CURRENT_KEY}-${sessionId}`);
  } catch (e) {
    console.warn('Failed to delete session:', e);
  }
}

/**
 * Delete all sessions
 */
export function clearAllSessions() {
  try {
    const sessions = listSessions();
    for (const s of sessions) {
      localStorage.removeItem(`${CURRENT_KEY}-${s.id}`);
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear sessions:', e);
  }
}
