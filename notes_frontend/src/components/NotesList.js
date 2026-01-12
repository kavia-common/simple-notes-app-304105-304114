import React from 'react';
import { formatUpdatedAt, getNoteDisplayTitle } from '../notes/notesTypes';

/**
 * PUBLIC_INTERFACE
 * NotesList renders the sidebar list of notes and provides controls for create/delete/select.
 *
 * @param {{
 *  notes: import('../notes/notesTypes').Note[],
 *  selectedNoteId: string | null,
 *  status: 'loading' | 'ready' | 'error',
 *  errorMessage?: string,
 *  onSelectNote: (id: string) => void,
 *  onCreateNote: () => void,
 *  onDeleteNote: (id: string) => void,
 *  onRetry?: () => void,
 *  isMobileOpen: boolean,
 *  onRequestCloseMobile: () => void,
 * }} props
 */
export default function NotesList({
  notes,
  selectedNoteId,
  status,
  errorMessage,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onRetry,
  isMobileOpen,
  onRequestCloseMobile,
}) {
  const listId = 'notes-list';
  const titleId = 'notes-sidebar-title';

  const handleSelect = (id) => {
    onSelectNote(id);
    // On mobile, close the drawer after selecting for better UX.
    onRequestCloseMobile();
  };

  return (
    <aside
      className={`sidebar ${isMobileOpen ? 'sidebar--open' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="sidebar__header">
        <div>
          <h1 className="appTitle" id={titleId}>
            Notes
          </h1>
          <p className="appSubtitle">Simple, local-first notes</p>
        </div>

        <div className="sidebar__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onCreateNote}
            aria-label="Create a new note"
          >
            New
          </button>
        </div>
      </div>

      <div className="sidebar__content" role="region" aria-label="Notes list">
        {status === 'loading' && (
          <div className="stateCard" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <div>
              <div className="stateTitle">Loading notes</div>
              <div className="stateText">Preparing your workspace…</div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="stateCard stateCard--error" role="alert">
            <div>
              <div className="stateTitle">Couldn’t load notes</div>
              <div className="stateText">{errorMessage || 'Unexpected error.'}</div>
            </div>
            {onRetry && (
              <button type="button" className="btn btn--secondary" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}

        {status === 'ready' && notes.length === 0 && (
          <div className="stateCard" role="status" aria-live="polite">
            <div>
              <div className="stateTitle">No notes yet</div>
              <div className="stateText">Create your first note to get started.</div>
            </div>
            <button type="button" className="btn btn--primary" onClick={onCreateNote}>
              Create note
            </button>
          </div>
        )}

        {status === 'ready' && notes.length > 0 && (
          <ul className="notesList" id={listId} role="list">
            {notes.map((note) => {
              const isSelected = note.id === selectedNoteId;

              return (
                <li key={note.id} className="notesList__item">
                  <button
                    type="button"
                    className={`noteRow ${isSelected ? 'noteRow--selected' : ''}`}
                    onClick={() => handleSelect(note.id)}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    <div className="noteRow__title">{getNoteDisplayTitle(note)}</div>
                    <div className="noteRow__meta">
                      <span className="noteRow__date">{formatUpdatedAt(note.updatedAt)}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="iconBtn iconBtn--danger"
                    onClick={() => onDeleteNote(note.id)}
                    aria-label={`Delete note "${getNoteDisplayTitle(note)}"`}
                    title="Delete note"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
