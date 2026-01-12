import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

/**
 * We mock the API client factory to control list/create/update/delete calls.
 */
jest.mock('./api/notesApi', () => {
  class BackendUnavailableError extends Error {
    constructor(message) {
      super(message);
      this.name = 'BackendUnavailableError';
    }
  }

  return {
    BackendUnavailableError,
    createNotesApiClient: jest.fn(),
  };
});

const { createNotesApiClient, BackendUnavailableError } = require('./api/notesApi');

function makeClient(overrides = {}) {
  return {
    listNotes: jest.fn().mockResolvedValue([]),
    createNote: jest.fn().mockImplementation(async (payload) => ({
      id: 'server_1',
      title: payload.title,
      content: payload.content,
      updatedAt: Date.now(),
    })),
    updateNote: jest.fn().mockImplementation(async (id, payload) => ({
      id,
      title: payload.title,
      content: payload.content,
      updatedAt: Date.now(),
    })),
    deleteNote: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

test('renders app and loads notes from API', async () => {
  const client = makeClient({
    listNotes: jest.fn().mockResolvedValue([
      { id: 'n1', title: 'From API', content: 'Hello', updatedAt: 10 },
    ]),
  });
  createNotesApiClient.mockReturnValue(client);

  render(<App />);

  // Sidebar title should show immediately
  expect(screen.getAllByText(/notes/i).length).toBeGreaterThan(0);

  // Wait for API-driven content
  await waitFor(() => expect(screen.getByText('From API')).toBeInTheDocument());
  expect(client.listNotes).toHaveBeenCalledTimes(1);
});

test('creates a note optimistically and then replaces with server note', async () => {
  const client = makeClient({
    listNotes: jest.fn().mockResolvedValue([]),
    createNote: jest.fn().mockResolvedValue({
      id: 'server_created',
      title: '',
      content: '',
      updatedAt: 123,
    }),
  });
  createNotesApiClient.mockReturnValue(client);

  render(<App />);

  // Ensure initial load completed
  await waitFor(() => expect(client.listNotes).toHaveBeenCalledTimes(1));

  const newButtons = screen.getAllByRole('button', { name: /new/i });
  // Use the first "New" (sidebar button) in desktop layout tests.
  fireEvent.click(newButtons[0]);

  // Optimistic note should show immediately in the editor (title input exists)
  expect(screen.getByLabelText(/title/i)).toBeInTheDocument();

  await waitFor(() => expect(client.createNote).toHaveBeenCalledTimes(1));

  // After server response, note should still be editable
  expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
});

test('falls back to local mode when backend is unavailable on initial load', async () => {
  const client = makeClient({
    listNotes: jest.fn().mockRejectedValue(new BackendUnavailableError('backend down')),
  });
  createNotesApiClient.mockReturnValue(client);

  render(<App />);

  // Should show offline banner and seed notes.
  await waitFor(() =>
    expect(screen.getByText(/backend unavailable — running in local mode/i)).toBeInTheDocument()
  );

  // Seed note title visible (from App seed)
  expect(screen.getByText('Welcome')).toBeInTheDocument();
});
