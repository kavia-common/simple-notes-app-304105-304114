/**
 * Note shape used throughout the app.
 * Kept in a small module so future API mapping is centralized.
 */

/**
 * PUBLIC_INTERFACE
 * @typedef {Object} Note
 * @property {string} id - Unique identifier.
 * @property {string} title - Note title.
 * @property {string} content - Note content body.
 * @property {number} updatedAt - Unix epoch ms timestamp of last update.
 */

/**
 * PUBLIC_INTERFACE
 * Creates a new Note with defaults.
 * @param {{title?: string, content?: string}} [partial]
 * @returns {import('./notesTypes').Note}
 */
export function createNote(partial = {}) {
  const now = Date.now();
  return {
    id: `note_${now}_${Math.random().toString(16).slice(2)}`,
    title: partial.title ?? '',
    content: partial.content ?? '',
    updatedAt: now,
  };
}

/**
 * PUBLIC_INTERFACE
 * Returns a human-friendly title for a note, with fallback.
 * @param {import('./notesTypes').Note} note
 * @returns {string}
 */
export function getNoteDisplayTitle(note) {
  const t = (note.title || '').trim();
  if (t.length > 0) return t;

  // Fallback to first line of content.
  const firstLine = (note.content || '').split('\n')[0].trim();
  if (firstLine.length > 0) return firstLine.slice(0, 40);

  return 'Untitled note';
}

/**
 * PUBLIC_INTERFACE
 * Formats the updated time for display.
 * @param {number} updatedAt
 * @returns {string}
 */
export function formatUpdatedAt(updatedAt) {
  try {
    return new Date(updatedAt).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
