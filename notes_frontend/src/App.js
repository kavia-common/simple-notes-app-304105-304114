import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';
import { createNote as createLocalNote } from './notes/notesTypes';
import { BackendUnavailableError, createNotesApiClient } from './api/notesApi';

/**
 * Sort notes newest-first.
 * @param {import('./notes/notesTypes').Note[]} list
 * @returns {import('./notes/notesTypes').Note[]}
 */
function sortNotes(list) {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Creates a small, local-only seed set for fallback mode.
 * @returns {import('./notes/notesTypes').Note[]}
 */
function createSeedNotes() {
  const seed = [
    createLocalNote({
      title: 'Welcome',
      content: 'Create, edit, and delete notes.\n\nThis app can run with or without a backend.',
    }),
    createLocalNote({
      title: 'Tip',
      content: 'If the backend is unavailable, the app switches to local-only mode automatically.',
    }),
  ].map((n, idx) => ({ ...n, updatedAt: n.updatedAt + idx })); // stable ordering
  return sortNotes(seed);
}

/**
 * Simple toast banner used for optimistic update failure messages.
 * (Kept intentionally small; no external deps.)
 *
 * @param {{ message: string, onDismiss: () => void }} props
 */
function Toast({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 100,
        background: '#111827',
        color: '#fff',
        padding: '10px 12px',
        borderRadius: 10,
        boxShadow: '0 10px 25px rgba(17, 24, 39, 0.22)',
        maxWidth: 360,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 13, lineHeight: 1.35 }}>{message}</div>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: '#fff',
            borderRadius: 8,
            padding: '4px 8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          aria-label="Dismiss message"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * Root application component.
 * Uses a REST API client when available. If the backend is unavailable (network/CORS/down),
 * the app falls back to local-only in-memory mode while showing a non-blocking banner.
 */
function App() {
  const api = useMemo(() => createNotesApiClient(), []);

  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [notes, setNotes] = useState([]);

  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // When true, CRUD operations use local in-memory behavior (still optimistic, but no server calls).
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Toast for non-blocking errors (optimistic revert, etc.)
  const [toastMessage, setToastMessage] = useState('');
  const toastTimeoutRef = useRef(0);

  const showToast = (message) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(''), 3500);
  };

  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // Initial load: prefer backend, fallback to local seed only if backend unavailable.
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      setErrorMessage('');
      try {
        const list = await api.listNotes({ signal: controller.signal });
        if (!mounted) return;
        setNotes(sortNotes(list));
        setIsOfflineMode(false);
        setStatus('ready');
      } catch (e) {
        if (!mounted) return;

        // Explicit fallback behavior for backend unavailable.
        if (e instanceof BackendUnavailableError) {
          setIsOfflineMode(true);
          setNotes(createSeedNotes());
          setStatus('ready');
          return;
        }

        setStatus('error');
        setErrorMessage(e instanceof Error ? e.message : 'Failed to load notes.');
      }
    }

    load();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [api]);

  // Ensure a sensible selection after initial load or delete.
  useEffect(() => {
    if (status !== 'ready') return;

    if (selectedNoteId && notes.some((n) => n.id === selectedNoteId)) return;

    if (notes.length > 0) {
      const mostRecent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setSelectedNoteId(mostRecent.id);
    } else {
      setSelectedNoteId(null);
    }
  }, [status, notes, selectedNoteId]);

  // PUBLIC_INTERFACE
  const retry = async () => {
    // Retry attempts to use backend again.
    setStatus('loading');
    setErrorMessage('');
    try {
      const list = await api.listNotes();
      setNotes(sortNotes(list));
      setIsOfflineMode(false);
      setStatus('ready');
    } catch (e) {
      if (e instanceof BackendUnavailableError) {
        setIsOfflineMode(true);
        setNotes((prev) => (prev.length ? prev : createSeedNotes()));
        setStatus('ready');
        showToast('Backend still unavailable. Staying in local mode.');
        return;
      }

      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Failed to load notes.');
    }
  };

  const enterOfflineModeIfNeeded = (e) => {
    if (e instanceof BackendUnavailableError) {
      setIsOfflineMode(true);
      // Keep current notes (optimistic state) but show banner.
      return true;
    }
    return false;
  };

  /**
   * Optimistic create:
   * - Insert temp note immediately
   * - On success, replace with server note
   * - On failure, revert and show toast
   */
  const createNewNote = async () => {
    const now = Date.now();
    const temp = createLocalNote({ title: '', content: '' });
    // Mark as optimistic so UI can show it right away even while network is slow.
    const tempId = temp.id;

    setNotes((prev) => sortNotes([{ ...temp, updatedAt: now }, ...prev]));
    setSelectedNoteId(tempId);
    setMobileSidebarOpen(false);

    if (isOfflineMode) return;

    try {
      const created = await api.createNote({ title: temp.title, content: temp.content });
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === tempId ? created : n))));
      setSelectedNoteId(created.id);
    } catch (e) {
      if (enterOfflineModeIfNeeded(e)) {
        showToast('Backend unavailable. Continuing in local mode.');
        return;
      }

      // revert: remove temp note
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setSelectedNoteId(null);
      showToast(e instanceof Error ? e.message : 'Failed to create note.');
    }
  };

  /**
   * Optimistic delete:
   * - Remove immediately
   * - On failure, restore previous list and show toast
   */
  const deleteNoteById = async (id) => {
    const prevNotes = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) setSelectedNoteId(null);

    if (isOfflineMode) return;

    try {
      await api.deleteNote(id);
    } catch (e) {
      if (enterOfflineModeIfNeeded(e)) {
        showToast('Backend unavailable. Delete kept locally.');
        return;
      }
      // revert
      setNotes(prevNotes);
      showToast(e instanceof Error ? e.message : 'Failed to delete note.');
    }
  };

  const deleteSelectedNote = async () => {
    if (!selectedNote) return;
    await deleteNoteById(selectedNote.id);
  };

  /**
   * Optimistic update:
   * - Apply patch locally immediately (including updatedAt)
   * - Fire API update (debounce left to future improvement; keep immediate for now)
   * - On failure, revert to previous note state and show toast
   */
  const updateSelectedNote = async (patch) => {
    if (!selectedNote) return;

    const previous = selectedNote;
    const now = Date.now();

    const optimistic = {
      ...previous,
      title: patch.title !== undefined ? patch.title : previous.title,
      content: patch.content !== undefined ? patch.content : previous.content,
      updatedAt: now,
    };

    setNotes((prev) => sortNotes(prev.map((n) => (n.id === previous.id ? optimistic : n))));

    if (isOfflineMode) return;

    try {
      const updated = await api.updateNote(previous.id, {
        title: optimistic.title,
        content: optimistic.content,
      });
      // server source of truth (may also update updatedAt)
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === previous.id ? updated : n))));
    } catch (e) {
      if (enterOfflineModeIfNeeded(e)) {
        showToast('Backend unavailable. Changes kept locally.');
        return;
      }

      // revert note only
      setNotes((prev) => sortNotes(prev.map((n) => (n.id === previous.id ? previous : n))));
      showToast(e instanceof Error ? e.message : 'Failed to update note.');
    }
  };

  return (
    <div className="appShell">
      <a className="skipLink" href="#main-editor">
        Skip to editor
      </a>

      {isOfflineMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            maxWidth: 1280,
            margin: '10px auto 0',
            padding: '10px 16px',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            background: 'rgba(59, 130, 246, 0.06)',
            borderRadius: 12,
            color: '#111827',
          }}
        >
          Backend unavailable — running in local mode. Changes won’t sync until the backend is reachable.
        </div>
      )}

      <div className="topBar mobileOnly" role="banner">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setMobileSidebarOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={mobileSidebarOpen ? 'true' : 'false'}
          aria-controls="sidebar-drawer"
        >
          Notes
        </button>
        <div className="topBar__title">Simple Notes</div>
        <button type="button" className="btn btn--primary" onClick={createNewNote}>
          New
        </button>
      </div>

      <div
        className={`overlay ${mobileSidebarOpen ? 'overlay--open' : ''}`}
        role="presentation"
        onClick={() => setMobileSidebarOpen(false)}
      />

      <div id="sidebar-drawer" className={`layout ${mobileSidebarOpen ? 'layout--drawerOpen' : ''}`}>
        <NotesList
          notes={notes}
          selectedNoteId={selectedNoteId}
          status={status}
          errorMessage={errorMessage}
          onSelectNote={setSelectedNoteId}
          onCreateNote={createNewNote}
          onDeleteNote={deleteNoteById}
          onRetry={retry}
          isMobileOpen={mobileSidebarOpen}
          onRequestCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <div className="mainArea" id="main-editor">
          <NoteEditor
            note={selectedNote}
            status={status}
            errorMessage={errorMessage}
            onChange={updateSelectedNote}
            onDelete={deleteSelectedNote}
            onCreate={createNewNote}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />

          <footer className="footer">
            <span className="footer__text">
              {isOfflineMode
                ? 'Local mode (backend unavailable).'
                : 'Connected mode (using backend API when available).'}
            </span>
          </footer>
        </div>
      </div>

      <Toast message={toastMessage} onDismiss={() => setToastMessage('')} />
    </div>
  );
}

export default App;
