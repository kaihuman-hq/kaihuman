import { configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCaptureController, type RepoFiles } from '../screens/quick-capture.js';
import { CaptureHubView } from './capture-hub-view.js';
import { type CaptureHeaderState, QuickCaptureView } from './quick-capture-view.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

class MemoryFiles implements RepoFiles {
  store = new Map<string, string>();
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [];
  paths = () => [...this.store.keys()];
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

describe('CaptureHubView', () => {
  it('gives every row an accessible title and subtitle', () => {
    render(<CaptureHubView onSelect={vi.fn()} />);
    expect(screen.getByText('Save a fact or link')).toBeTruthy();
    expect(screen.getByText(/saved to your repository/i)).toBeTruthy();
  });
});

describe('QuickCaptureView', () => {
  const controller = () => new QuickCaptureController(new MemoryFiles());

  it('stores tags with a todo and dismisses after the confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const files = new MemoryFiles();
    const onDone = vi.fn();
    render(
      <QuickCaptureView
        controller={new QuickCaptureController(files)}
        kind="todo"
        onDone={onDone}
      />,
    );
    fireEvent.change(screen.getByLabelText('Todo'), { target: { value: 'call mum' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'home' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Todo added')).toBeTruthy());
    expect(files.store.get('.kh/inbox.todos.md')).toContain('#home');
    expect((screen.getByLabelText('Todo') as HTMLInputElement).value).toBe('');
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('inbox is one field that saves to the inbox on Return', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const files = new MemoryFiles();
    const onDone = vi.fn();
    render(
      <QuickCaptureView
        controller={new QuickCaptureController(files)}
        kind="inbox"
        onDone={onDone}
      />,
    );
    expect(screen.getByText('Add to inbox')).toBeTruthy();
    expect(screen.queryByTestId('capture-extra')).toBeNull();
    expect(screen.queryByText(/due/i)).toBeNull();
    const field = screen.getByLabelText('Inbox');
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.tagName).toBe('INPUT');
    fireEvent.change(field, { target: { value: 'renew passport' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Todo added')).toBeTruthy());
    expect(files.store.get('.kh/inbox.todos.md')).toContain('- [ ] renew passport');
    vi.advanceTimersByTime(1000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('focuses the main field when the sheet opens', async () => {
    render(<QuickCaptureView controller={controller()} kind="note" />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Note')));
  });

  it('keeps the sheet open and shows the error when saving fails', async () => {
    const onDone = vi.fn();
    render(<QuickCaptureView controller={controller()} kind="knowledge" onDone={onDone} />);
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Error: Nothing to add')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each(['note', 'idea', 'knowledge'] as const)('%s uses a multiline body', (kind) => {
    render(<QuickCaptureView controller={controller()} kind={kind} />);
    expect(screen.getByTestId('capture-text').tagName).toBe('TEXTAREA');
  });

  it('hands the primary action to the header when asked', async () => {
    const states: CaptureHeaderState[] = [];
    render(
      <QuickCaptureView
        controller={controller()}
        kind="note"
        headerAction
        onHeaderState={(s) => states.push(s)}
      />,
    );
    expect(screen.queryByTestId('capture-submit')).toBeNull();
    expect(states.at(-1)?.canSubmit).toBe(false);
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hello' } });
    await waitFor(() => expect(states.at(-1)?.canSubmit).toBe(true));
    states.at(-1)?.submit();
    await waitFor(() => expect(screen.getByText('Note saved')).toBeTruthy());
  });
});

describe('QuickCaptureView file placement', () => {
  beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

  it('keeps the built-in file on one tap and shows where it goes', async () => {
    const files = new MemoryFiles();
    render(<QuickCaptureView controller={new QuickCaptureController(files)} kind="note" />);
    expect(screen.getByRole('button', { name: 'Saves to .kh/dump.md' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Note saved')).toBeTruthy());
    expect(files.store.get('.kh/dump.md')).toContain('hello');
  });

  it('saves into a picked folder and name, then starts there next time', async () => {
    const files = new MemoryFiles();
    files.store.set('journal/old.md', '');
    const { unmount } = render(
      <QuickCaptureView controller={new QuickCaptureController(files)} kind="note" />,
    );
    fireEvent.click(screen.getByTestId('create-target-row'));
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'jour' } });
    fireEvent.click(screen.getByTestId('create-folder-journal'));
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'Big Day.md' } });
    expect(screen.getByText('Creates journal/big-day.md')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Note saved')).toBeTruthy());
    expect(files.store.get('journal/big-day.md')).toContain('hello');
    unmount();
    render(<QuickCaptureView controller={new QuickCaptureController(files)} kind="note" />);
    expect(screen.getByRole('button', { name: 'Saves to journal/dump.md' })).toBeTruthy();
  });

  it('refuses a folder outside the repo', async () => {
    const files = new MemoryFiles();
    render(<QuickCaptureView controller={new QuickCaptureController(files)} kind="todo" />);
    fireEvent.click(screen.getByTestId('create-target-row'));
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '../x' } });
    fireEvent.change(screen.getByLabelText('Todo'), { target: { value: 'a' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() =>
      expect(screen.getByText('Error: Use a folder inside the repo.')).toBeTruthy(),
    );
    expect(files.store.size).toBe(0);
  });

  it('has no placement row where the path is fixed', () => {
    render(
      <QuickCaptureView controller={new QuickCaptureController(new MemoryFiles())} kind="idea" />,
    );
    expect(screen.queryByTestId('create-target-row')).toBeNull();
  });
});

describe('QuickCaptureView header state', () => {
  beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

  // Regression: the screen stores the header state with `useState`. The effect that reports it
  // depended on a fresh `place.target` object each render, so every report re-rendered the
  // screen and reported again: an endless update loop that killed the iOS app on open.
  it.each([
    'todo',
    'note',
    'log',
    'knowledge',
  ] as const)('%s settles when the parent stores the header state', async (kind) => {
    let reports = 0;
    const controller = new QuickCaptureController(new MemoryFiles());
    function Host() {
      const [, setHeader] = useState<CaptureHeaderState | null>(null);
      // Stable, like the real screen's `setHeader`.
      const [report] = useState(() => (s: CaptureHeaderState) => {
        // Stop feeding the loop so a regression fails instead of hanging the run.
        if (++reports < 20) setHeader(s);
      });
      return (
        <QuickCaptureView controller={controller} kind={kind} headerAction onHeaderState={report} />
      );
    }
    render(<Host />);
    await new Promise((r) => setTimeout(r, 50));
    expect(reports).toBeLessThan(5);
  });
});
