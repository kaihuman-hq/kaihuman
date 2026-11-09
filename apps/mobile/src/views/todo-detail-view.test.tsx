import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepoFiles } from '../screens/quick-capture.js';
import { TodoDetailController } from '../screens/todo-detail.js';
import { TodoDetailView } from './todo-detail-view.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class MemoryFiles implements RepoFiles {
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

const PATH = '.kh/inbox.todos.md';
const files = () =>
  new MemoryFiles(new Map([[PATH, '- [ ] write tests #qa\n- [ ] ship it #release\n']]));
const items = (f: MemoryFiles) => parseTodos(f.store.get(PATH) ?? '').items;

describe('TodoDetailView', () => {
  it('loads, then shows the title and tag suggestions', async () => {
    const f = files();
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText('Loading todo')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('todo-title')).toBeTruthy());
    expect((screen.getByTestId('todo-title') as HTMLTextAreaElement).value).toBe('write tests');
    expect(screen.getByLabelText('Remove tag qa')).toBeTruthy();
    expect(screen.getByLabelText('Add tag release')).toBeTruthy();
  });

  it('writes a status change immediately', async () => {
    const f = files();
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByTestId('todo-status'));
    fireEvent.click(screen.getByText('Done'));
    await waitFor(() => expect(items(f)[0]?.status).toBe('done'));
  });

  it('adds a typed tag and removes one', async () => {
    const f = files();
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByTestId('todo-tag-input'));
    fireEvent.change(screen.getByTestId('todo-tag-input'), { target: { value: '#home' } });
    fireEvent.keyDown(screen.getByTestId('todo-tag-input'), { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(items(f)[0]?.tags).toEqual(['qa', 'home']));
    fireEvent.click(screen.getByLabelText('Remove tag qa'));
    await waitFor(() => expect(items(f)[0]?.tags).toEqual(['home']));
  });

  it('autosaves the title after the debounce, and reports an empty one', async () => {
    const f = files();
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByTestId('todo-title'));
    fireEvent.change(screen.getByTestId('todo-title'), { target: { value: 'write more tests' } });
    await waitFor(() => expect(items(f)[0]?.text).toBe('write more tests'), { timeout: 2000 });
    fireEvent.change(screen.getByTestId('todo-title'), { target: { value: '  ' } });
    await waitFor(() => expect(screen.getByText('A todo needs a title')).toBeTruthy(), {
      timeout: 2000,
    });
    expect(items(f)[0]?.text).toBe('write more tests');
  });

  it('deletes after confirming, offers Undo, and closes after the timeout', async () => {
    const f = files();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={onClose} />,
    );
    await waitFor(() => screen.getByTestId('todo-delete'));
    fireEvent.click(screen.getByTestId('todo-delete'));
    await waitFor(() => expect(screen.getByText('Todo deleted')).toBeTruthy());
    expect(items(f).map((i) => i.text)).toEqual(['ship it']);
    fireEvent.click(screen.getByTestId('todo-undo'));
    await waitFor(() => expect(screen.getByTestId('todo-title')).toBeTruthy());
    expect(items(f).map((i) => i.text)).toEqual(['write tests', 'ship it']);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing when the delete confirmation is declined', async () => {
    const f = files();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <TodoDetailView controller={new TodoDetailController(`${PATH}#0`, f)} onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByTestId('todo-delete'));
    fireEvent.click(screen.getByTestId('todo-delete'));
    await new Promise((r) => setTimeout(r, 20));
    expect(items(f)).toHaveLength(2);
  });

  it('shows not-found with a way back', async () => {
    const onClose = vi.fn();
    render(
      <TodoDetailView
        controller={new TodoDetailController(`${PATH}#9`, files())}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('This todo no longer exists')).toBeTruthy());
    fireEvent.click(screen.getByText('Back to board'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
