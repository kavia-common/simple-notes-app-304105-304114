/**
 * Placeholder Notes API client.
 * Not integrated in this step; kept for future backend wiring.
 */

/**
 * PUBLIC_INTERFACE
 * Returns the configured API base URL (future use).
 * @returns {string | undefined}
 */
export function getApiBaseUrl() {
  // These environment variables are provided by the container; we do not require them yet.
  return process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL;
}

/**
 * PUBLIC_INTERFACE
 * Placeholder function for fetching notes from backend in the future.
 * @returns {Promise<never>}
 */
export async function fetchNotes() {
  throw new Error('fetchNotes is not implemented yet (local state only).');
}

/**
 * PUBLIC_INTERFACE
 * Placeholder function for creating a note on backend in the future.
 * @returns {Promise<never>}
 */
export async function createNoteApi() {
  throw new Error('createNoteApi is not implemented yet (local state only).');
}

/**
 * PUBLIC_INTERFACE
 * Placeholder function for updating a note on backend in the future.
 * @returns {Promise<never>}
 */
export async function updateNoteApi() {
  throw new Error('updateNoteApi is not implemented yet (local state only).');
}

/**
 * PUBLIC_INTERFACE
 * Placeholder function for deleting a note on backend in the future.
 * @returns {Promise<never>}
 */
export async function deleteNoteApi() {
  throw new Error('deleteNoteApi is not implemented yet (local state only).');
}
