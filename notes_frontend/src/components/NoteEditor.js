import React, { useEffect, useMemo, useRef } from 'react';
import { formatUpdatedAt } from '../notes/notesTypes';

/**
 * PUBLIC_INTERFACE
 * NoteEditor renders the main editor for the selected note.
 *
 * @param {{
 *  note: import('../notes/notesTypes').Note | null,
 *  status: 'loading' | 'ready' | 'error',
 *  errorMessage?: string,
 *  onChange: (patch: { title?: string, content?: string }) => void,
 *  onDelete: () => void,
 *  onCreate: () => void,
 *  onOpenMobileSidebar: () => void,
 * }} props
 */
export default function NoteEditor({
  note,
  status,
  errorMessage,
  onChange,
  onDelete,
  onCreate,
  onOpenMobileSidebar,
}) {
  const titleInputRef = useRef(null);

  // Focus title when switching notes / creating.
  useEffect(() => {
    if (note && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [note?.id]);

  const updatedAtLabel = useMemo(() => {
    if (!note) return '';
    const formatted = formatUpdatedAt(note.updatedAt);
    return formatted ? `Last updated ${formatted}` : '';
  }, [note]);

  if (status === 'loading') {
    return (
      <main className="editor" aria-label="Note editor">
        <div className="editor__header">
          <button type="button" className="btn btn--ghost mobileOnly" onClick={onOpenMobileSidebar}>
            Notes
          </button>
        </div>
        <div className="editor__empty" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div>
            <div className="stateTitle">Loading editor</div>
            <div className="stateText">Just a moment…</div>
          </div>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="editor" aria-label="Note editor">
        <div className="editor__header">
          <button type="button" className="btn btn--ghost mobileOnly" onClick={onOpenMobileSidebar}>
            Notes
          </button>
        </div>
        <div className="editor__empty" role="alert">
          <div className="stateTitle">Something went wrong</div>
          <div className="stateText">{errorMessage || 'Unexpected error.'}</div>
        </div>
      </main>
    );
  }

  if (!note) {
    return (
      <main className="editor" aria-label="Note editor">
        <div className="editor__header">
          <button type="button" className="btn btn--ghost mobileOnly" onClick={onOpenMobileSidebar}>
            Notes
          </button>
        </div>

        <div className="editor__empty" role="status" aria-live="polite">
          <div>
            <div className="stateTitle">Select a note</div>
            <div className="stateText">Choose a note from the list, or create a new one.</div>
          </div>
          <button type="button" className="btn btn--primary" onClick={onCreate}>
            New note
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="editor" aria-label="Note editor">
      <div className="editor__header">
        <button type="button" className="btn btn--ghost mobileOnly" onClick={onOpenMobileSidebar}>
          Notes
        </button>

        <div className="editor__meta" aria-live="polite">
          {updatedAtLabel}
        </div>

        <div className="editor__actions">
          <button type="button" className="btn btn--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="editor__body">
        <label className="fieldLabel" htmlFor="note-title">
          Title
        </label>
        <input
          id="note-title"
          ref={titleInputRef}
          className="input"
          type="text"
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Untitled"
          autoComplete="off"
        />

        <label className="fieldLabel" htmlFor="note-content">
          Content
        </label>
        <textarea
          id="note-content"
          className="textarea"
          value={note.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Write something…"
          rows={12}
        />
      </div>
    </main>
  );
}
