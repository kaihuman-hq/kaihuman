import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
