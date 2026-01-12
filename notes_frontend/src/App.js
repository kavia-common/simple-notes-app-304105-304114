import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';
import { createNote } from './notes/notesTypes';

/**
 * Simple local notes repository simulator.
 * This is intentionally local-only for now, but shaped like an async layer
 * so we can swap to a REST API later with minimal UI changes.
 */
function useLocalNotesRepository() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    let mounted = true;

    // Simulated initial load to enable loading UI.
    const t = window.setTimeout(() => {
      if (!mounted) return;

      try {
        const seed = [
          createNote({ title: 'Welcome', content: 'Create, edit, and delete notes.\n\nThis app is local-only for now.' }),
          createNote({ title: 'Tip', content: 'Use the sidebar to switch notes.\nYour changes are saved locally in memory.' }),
        ].map((n, idx) => ({ ...n, updatedAt: n.updatedAt + idx })); // stable ordering
        setNotes(seed);
        setStatus('ready');
      } catch (e) {
        setStatus('error');
        setErrorMessage(e instanceof Error ? e.message : 'Failed to initialize.');
      }
    }, 450);

    return () => {
      mounted = false;
      window.clearTimeout(t);
    };
  }, []);

  // PUBLIC_INTERFACE
  const retry = () => {
    setStatus('loading');
    setErrorMessage('');
    // Re-run the same initialization by forcing reload of seed data.
    window.setTimeout(() => {
      setNotes([]);
      setStatus('ready');
    }, 300);
  };

  return { status, errorMessage, notes, setNotes, retry };
}

// PUBLIC_INTERFACE
function App() {
  const { status, errorMessage, notes, setNotes, retry } = useLocalNotesRepository();

  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // Ensure a sensible selection after initial load or delete.
  useEffect(() => {
    if (status !== 'ready') return;

    if (selectedNoteId && notes.some((n) => n.id === selectedNoteId)) return;

    // If nothing selected, pick most recently updated note.
    if (notes.length > 0) {
      const mostRecent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setSelectedNoteId(mostRecent.id);
    } else {
      setSelectedNoteId(null);
    }
  }, [status, notes, selectedNoteId]);

  const sortNotes = (list) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

  const createNewNote = () => {
    const n = createNote({ title: '', content: '' });
    setNotes((prev) => sortNotes([n, ...prev]));
    setSelectedNoteId(n.id);
    setMobileSidebarOpen(false);
  };

  const deleteNoteById = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    }
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    deleteNoteById(selectedNote.id);
  };

  const updateSelectedNote = (patch) => {
    if (!selectedNote) return;
    const now = Date.now();

    setNotes((prev) =>
      sortNotes(
        prev.map((n) =>
          n.id === selectedNote.id
            ? {
                ...n,
                title: patch.title !== undefined ? patch.title : n.title,
                content: patch.content !== undefined ? patch.content : n.content,
                updatedAt: now,
              }
            : n
        )
      )
    );
  };

  return (
    <div className="appShell">
      <a className="skipLink" href="#main-editor">
        Skip to editor
      </a>

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

      {/* Mobile overlay for sidebar */}
      <div
        className={`overlay ${mobileSidebarOpen ? 'overlay--open' : ''}`}
        role="presentation"
        onClick={() => setMobileSidebarOpen(false)}
      />

      <div
        id="sidebar-drawer"
        className={`layout ${mobileSidebarOpen ? 'layout--drawerOpen' : ''}`}
      >
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
              Local mode (no backend). API hooks prepared for later integration.
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
