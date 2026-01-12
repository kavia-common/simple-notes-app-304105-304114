/**
 * Notes REST API client.
 *
 * This module is NOT yet wired into the UI. It provides a configurable client with:
 * - Base URL derived from env vars (REACT_APP_API_BASE preferred, else REACT_APP_BACKEND_URL, else window.location.origin)
 * - CRUD methods for /notes endpoints
 * - Robust error mapping (including BackendUnavailableError for network/CORS/backend-down scenarios)
 * - Small retry (2 retries with exponential backoff) for network failures and 5xx responses
 */

/**
 * Attempt to detect a browser/network/CORS/backend-down style error.
 * In browsers, `fetch()` rejects with a TypeError for network failures and CORS blocks.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isLikelyNetworkOrCorsError(error) {
  // Most browsers: "TypeError: Failed to fetch" (Chrome), "NetworkError when attempting to fetch resource." (Firefox)
  if (!(error instanceof Error)) return false;
  return error.name === 'TypeError' || /failed to fetch|networkerror|network error/i.test(error.message);
}

/**
 * Normalizes base URL by removing trailing slashes.
 * @param {string} baseUrl
 * @returns {string}
 */
function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

/**
 * Joins base URL and path with exactly one slash between.
 * @param {string} baseUrl
 * @param {string} path
 * @returns {string}
 */
function joinUrl(baseUrl, path) {
  const b = normalizeBaseUrl(baseUrl);
  const p = String(path || '');
  if (!p) return b;
  if (p.startsWith('/')) return `${b}${p}`;
  return `${b}/${p}`;
}

/**
 * Sleep helper for retry backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Derives the API base URL from environment variables, with a safe default.
 *
 * Preference order:
 *  1) REACT_APP_API_BASE
 *  2) REACT_APP_BACKEND_URL
 *  3) window.location.origin (same-origin)
 *
 * PUBLIC_INTERFACE
 * @returns {string}
 */
export function getApiBaseUrl() {
  const envBase =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  return normalizeBaseUrl(envBase);
}

/**
 * Generic API error (non-2xx, unexpected response, etc).
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{
   *  status?: number,
   *  url?: string,
   *  details?: unknown,
   *  retriable?: boolean,
   * }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.url = opts.url;
    this.details = opts.details;
    this.retriable = Boolean(opts.retriable);
  }
}

/**
 * Error representing the backend being unreachable/unavailable from the browser
 * (network down, backend down, CORS blocked, DNS failure, etc).
 */
export class BackendUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {{ url?: string, cause?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'BackendUnavailableError';
    this.url = opts.url;
    this.cause = opts.cause;
  }
}

/**
 * @typedef {Object} NotesApiClientOptions
 * @property {string} [baseUrl] - Base URL for the backend, e.g. "https://api.example.com". Defaults via getApiBaseUrl().
 * @property {number} [timeoutMs] - Request timeout in ms. Defaults to 12000.
 * @property {number} [retries] - Number of retries after the initial attempt. Defaults to 2.
 * @property {number} [retryBaseDelayMs] - Base backoff delay in ms. Defaults to 250.
 * @property {RequestInit} [fetchOptions] - Additional options merged into each fetch call (e.g., headers).
 */

/**
 * @typedef {Object} NotesApiClient
 * @property {(opts?: { signal?: AbortSignal }) => Promise<import('../notes/notesTypes').Note[]>} listNotes
 * @property {(id: string, opts?: { signal?: AbortSignal }) => Promise<import('../notes/notesTypes').Note>} getNote
 * @property {(payload: { title: string, content: string }, opts?: { signal?: AbortSignal }) => Promise<import('../notes/notesTypes').Note>} createNote
 * @property {(id: string, payload: { title: string, content: string }, opts?: { signal?: AbortSignal }) => Promise<import('../notes/notesTypes').Note>} updateNote
 * @property {(id: string, opts?: { signal?: AbortSignal }) => Promise<void>} deleteNote
 */

/**
 * Internal fetch wrapper with:
 * - JSON parsing (when appropriate)
 * - Timeout (via AbortController)
 * - Retries for network errors and 5xx responses
 *
 * @param {{
 *  baseUrl: string,
 *  path: string,
 *  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
 *  body?: unknown,
 *  headers?: Record<string, string>,
 *  signal?: AbortSignal,
 *  timeoutMs: number,
 *  retries: number,
 *  retryBaseDelayMs: number,
 *  fetchOptions?: RequestInit,
 * }} args
 * @returns {Promise<{ status: number, data: any, headers: Headers }>}
 */
async function requestJsonWithRetries(args) {
  const url = joinUrl(args.baseUrl, args.path);

  // We implement timeout with our own AbortController, but allow caller's signal to cancel too.
  // If either aborts, fetch will abort.
  const timeoutController = new AbortController();

  const onExternalAbort = () => timeoutController.abort();
  if (args.signal) {
    if (args.signal.aborted) timeoutController.abort();
    else args.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutId = window.setTimeout(() => timeoutController.abort(), args.timeoutMs);

  /**
   * Attempt once. Returned errors are normalized such that callers can reason about retriable failures.
   * @param {number} attemptIndex
   * @returns {Promise<{ status: number, data: any, headers: Headers }>}
   */
  const attemptOnce = async (attemptIndex) => {
    try {
      const headers = {
        Accept: 'application/json',
        ...(args.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(args.headers || {}),
      };

      const res = await fetch(url, {
        method: args.method,
        headers,
        body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
        signal: timeoutController.signal,
        ...(args.fetchOptions || {}),
      });

      const contentType = res.headers.get('content-type') || '';
      const canParseJson = contentType.includes('application/json');

      // Try to parse JSON on non-empty bodies; fall back to text for debugging.
      let parsedBody = null;
      if (res.status !== 204) {
        if (canParseJson) {
          try {
            parsedBody = await res.json();
          } catch {
            parsedBody = null;
          }
        } else {
          try {
            const text = await res.text();
            parsedBody = text || null;
          } catch {
            parsedBody = null;
          }
        }
      }

      if (!res.ok) {
        const retriable = res.status >= 500 && res.status <= 599;
        throw new ApiError(`Request failed with status ${res.status}`, {
          status: res.status,
          url,
          details: parsedBody,
          retriable,
        });
      }

      return { status: res.status, data: parsedBody, headers: res.headers };
    } catch (e) {
      // If aborted due to timeout or external cancellation
      if (timeoutController.signal.aborted) {
        // If caller aborted, treat as normal cancellation; do not convert to backend-unavailable.
        // (Callers can catch DOMException/AbortError if they pass a signal; we unify into ApiError for clarity.)
        // Note: browsers throw DOMException('The user aborted a request.', 'AbortError') or similar.
        const msg = attemptIndex === 0 ? 'Request aborted or timed out.' : 'Request aborted or timed out after retries.';
        throw new ApiError(msg, { url, retriable: false, details: e });
      }

      // Network/CORS/backend unreachable => typed error, and it is retriable.
      if (isLikelyNetworkOrCorsError(e)) {
        throw new BackendUnavailableError('Backend is unavailable (network/CORS error).', { url, cause: e });
      }

      // Unknown runtime error: wrap into ApiError.
      if (e instanceof ApiError || e instanceof BackendUnavailableError) throw e;

      throw new ApiError('Unexpected error while calling backend.', { url, retriable: false, details: e });
    }
  };

  try {
    const maxAttempts = 1 + Math.max(0, args.retries);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await attemptOnce(attempt);
      } catch (e) {
        const isLast = attempt === maxAttempts - 1;

        // Determine if we should retry
        const shouldRetry =
          !isLast &&
          (e instanceof BackendUnavailableError || (e instanceof ApiError && e.retriable === true));

        if (!shouldRetry) throw e;

        const backoff = args.retryBaseDelayMs * Math.pow(2, attempt); // 250ms, 500ms, ...
        await sleep(backoff);
      }
    }

    // Should be unreachable due to loop logic.
    throw new ApiError('Request failed after retries.', { url, retriable: false });
  } finally {
    window.clearTimeout(timeoutId);
    if (args.signal) {
      args.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Factory for creating a Notes API client.
 *
 * The client exposes CRUD methods for:
 * - GET    /notes
 * - GET    /notes/:id
 * - POST   /notes
 * - PUT    /notes/:id
 * - DELETE /notes/:id
 *
 * PUBLIC_INTERFACE
 * @param {NotesApiClientOptions} [options]
 * @returns {NotesApiClient}
 */
export function createNotesApiClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || getApiBaseUrl());
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 12000;
  const retries = typeof options.retries === 'number' ? options.retries : 2;
  const retryBaseDelayMs =
    typeof options.retryBaseDelayMs === 'number' ? options.retryBaseDelayMs : 250;

  /**
   * PUBLIC_INTERFACE
   * List notes.
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<import('../notes/notesTypes').Note[]>}
   * @throws {BackendUnavailableError|ApiError}
   */
  const listNotes = async (opts = {}) => {
    const res = await requestJsonWithRetries({
      baseUrl,
      path: '/notes',
      method: 'GET',
      timeoutMs,
      retries,
      retryBaseDelayMs,
      signal: opts.signal,
      fetchOptions: options.fetchOptions,
    });

    if (!Array.isArray(res.data)) {
      throw new ApiError('Invalid response shape for listNotes (expected array).', {
        url: joinUrl(baseUrl, '/notes'),
        details: res.data,
        retriable: false,
      });
    }
    return res.data;
  };

  /**
   * PUBLIC_INTERFACE
   * Fetch a single note by id.
   * @param {string} id
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<import('../notes/notesTypes').Note>}
   * @throws {BackendUnavailableError|ApiError}
   */
  const getNote = async (id, opts = {}) => {
    if (!id) throw new ApiError('getNote requires an id.', { retriable: false });

    const res = await requestJsonWithRetries({
      baseUrl,
      path: `/notes/${encodeURIComponent(id)}`,
      method: 'GET',
      timeoutMs,
      retries,
      retryBaseDelayMs,
      signal: opts.signal,
      fetchOptions: options.fetchOptions,
    });

    if (!res.data || typeof res.data !== 'object') {
      throw new ApiError('Invalid response shape for getNote (expected object).', {
        url: joinUrl(baseUrl, `/notes/${encodeURIComponent(id)}`),
        details: res.data,
        retriable: false,
      });
    }

    return res.data;
  };

  /**
   * PUBLIC_INTERFACE
   * Create a new note.
   * @param {{ title: string, content: string }} payload
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<import('../notes/notesTypes').Note>}
   * @throws {BackendUnavailableError|ApiError}
   */
  const createNote = async (payload, opts = {}) => {
    if (!payload || typeof payload !== 'object') {
      throw new ApiError('createNote requires a payload object.', { retriable: false });
    }

    const res = await requestJsonWithRetries({
      baseUrl,
      path: '/notes',
      method: 'POST',
      body: payload,
      timeoutMs,
      retries,
      retryBaseDelayMs,
      signal: opts.signal,
      fetchOptions: options.fetchOptions,
    });

    if (!res.data || typeof res.data !== 'object') {
      throw new ApiError('Invalid response shape for createNote (expected object).', {
        url: joinUrl(baseUrl, '/notes'),
        details: res.data,
        retriable: false,
      });
    }

    return res.data;
  };

  /**
   * PUBLIC_INTERFACE
   * Update an existing note by id.
   * @param {string} id
   * @param {{ title: string, content: string }} payload
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<import('../notes/notesTypes').Note>}
   * @throws {BackendUnavailableError|ApiError}
   */
  const updateNote = async (id, payload, opts = {}) => {
    if (!id) throw new ApiError('updateNote requires an id.', { retriable: false });
    if (!payload || typeof payload !== 'object') {
      throw new ApiError('updateNote requires a payload object.', { retriable: false });
    }

    const res = await requestJsonWithRetries({
      baseUrl,
      path: `/notes/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: payload,
      timeoutMs,
      retries,
      retryBaseDelayMs,
      signal: opts.signal,
      fetchOptions: options.fetchOptions,
    });

    if (!res.data || typeof res.data !== 'object') {
      throw new ApiError('Invalid response shape for updateNote (expected object).', {
        url: joinUrl(baseUrl, `/notes/${encodeURIComponent(id)}`),
        details: res.data,
        retriable: false,
      });
    }

    return res.data;
  };

  /**
   * PUBLIC_INTERFACE
   * Delete a note by id.
   * @param {string} id
   * @param {{ signal?: AbortSignal }} [opts]
   * @returns {Promise<void>}
   * @throws {BackendUnavailableError|ApiError}
   */
  const deleteNote = async (id, opts = {}) => {
    if (!id) throw new ApiError('deleteNote requires an id.', { retriable: false });

    await requestJsonWithRetries({
      baseUrl,
      path: `/notes/${encodeURIComponent(id)}`,
      method: 'DELETE',
      timeoutMs,
      retries,
      retryBaseDelayMs,
      signal: opts.signal,
      fetchOptions: options.fetchOptions,
    });
  };

  return {
    listNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
  };
}
