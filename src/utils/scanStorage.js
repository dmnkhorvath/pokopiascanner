/**
 * localStorage persistence for scan results.
 * Stores sessions with timestamps, supports merge and history.
 */

const STORAGE_KEY = 'pokopia-scan-sessions';
const CURRENT_KEY = 'pokopia-current-session';
const MAX_SESSIONS = 20;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB safety limit

/**
 * Get all saved sessions (metadata only, sorted newest first)
 * @returns {Array<{id, date, totalFound, scanCount, categories}>}
 */
export function listSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    if (!Array.isArray(sessions)) return [];
    return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}

/**
 * Save or update the current session.
 * Returns the session ID on success, 'QUOTA_EXCEEDED' if payload > 4 MB, or null on error.
 * @param {Object} results - The scan results object
 * @param {number} scanCount - Number of scans in this session
 * @param {string|null} sessionId - Existing session ID to update, or null for new
 * @returns {string|null} The session ID, 'QUOTA_EXCEEDED', or null
 */
export function saveSession(results, scanCount, sessionId = null) {
  try {
    // Estimate payload size before saving
    let payload;
    try { payload = JSON.stringify({ results, scanCount, savedAt: new Date().toISOString() }); } catch (serErr) { console.warn('[scanStorage] JSON.stringify failed (circular ref?):', serErr); return null; }
    if (payload.length > MAX_PAYLOAD_BYTES) {
      console.warn(`[scanStorage] Payload too large (${(payload.length / 1024 / 1024).toFixed(1)} MB). Skipping save.`);
      return 'QUOTA_EXCEEDED';
    }

    const sessions = listSessions();
    const id = sessionId || (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

    // Keep max sessions — remove full result data for evicted sessions
    if (sessions.length > MAX_SESSIONS) {
      const evicted = sessions.slice(MAX_SESSIONS);
      for (const s of evicted) {
        localStorage.removeItem(`${CURRENT_KEY}-${s.id}`);
      }
    }
    const trimmed = sessions.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    // Save full results for current session
    localStorage.setItem(`${CURRENT_KEY}-${id}`, payload);

    return id;
  } catch (e) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      console.warn('[scanStorage] localStorage quota exceeded:', e);
      return 'QUOTA_EXCEEDED';
    }
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
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
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

/**
 * Estimate total localStorage usage for pokopia-* keys (in bytes).
 * @returns {number} Approximate bytes used
 */
export function estimateStorageUsage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pokopia')) {
        const val = localStorage.getItem(key);
        total += (key.length + (val ? val.length : 0)) * 2; // UTF-16 chars = 2 bytes each
      }
    }
  } catch {
    // ignore
  }
  return total;
}
