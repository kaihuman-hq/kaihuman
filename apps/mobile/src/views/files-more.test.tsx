import { webcrypto } from 'node:crypto';
import { encrypt, type TreeItem } from '@kaihuman/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ContentFiles,
  FileEditorController,
  type PasswordPort,
} from '../screens/file-editor-screen.js';
import { FileBrowserView, FileEditorView, type FileMode } from './file-editor-view.js';
import { FileModeToggle } from './file-mode-toggle.js';
import { MoreView } from './more-view.js';

afterEach(cleanup);

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
  if (!window.crypto?.subtle) {
    Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  }
});

const passwords = (): PasswordPort => {
  const saved = new Map<string, string>();
  return {
    getPassword: (p) => saved.get(p),
    setPassword: (p, pw) => void saved.set(p, pw),
    clearPassword: (p) => void saved.delete(p),
  };
};

const memory = (initial: Record<string, string>, over: Partial<ContentFiles> = {}) => {
  const map = new Map(Object.entries(initial));
  const files: ContentFiles = {
    tree: () =>
      [...map.keys()].map(
        (path): TreeItem => ({ path, mode: '100644', type: 'blob', sha: path, url: '' }),
      ),
    refresh: async () => {},
    read: async (p) => map.get(p) as string,
    write: async (p, c) => void map.set(p, c),
    create: async (p, c) => void map.set(p, c),
    remove: async (p) => void map.delete(p),
    rename: async () => {},
    ...over,
  };
  return { map, files };
};

describe('FileBrowserView', () => {
  it('shows an empty state for an empty repository', async () => {
    const controller = new FileEditorController({
      files: memory({}).files,
      passwords: passwords(),
    });
    render(<FileBrowserView controller={controller} onOpenFile={vi.fn()} />);
    expect(await screen.findByText('No files yet')).toBeTruthy();
  });

  it('marks encrypted files, counts folder items and navigates by breadcrumb', async () => {
    const { files } = memory({ 'a/b/c.md': '1', 'a/x.md.enc': '2', 'top.md': '3' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileBrowserView controller={controller} onOpenFile={vi.fn()} />);
    await screen.findByRole('button', { name: 'a' });
    expect(screen.getAllByText('2 items')).toHaveLength(2); // folder "a" and the section footer
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(screen.getAllByText('Encrypted').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(screen.getByRole('button', { name: 'c.md' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Files' })); // root crumb
    expect(screen.getByRole('button', { name: 'top.md' })).toBeTruthy();
  });

  it('surfaces a refresh failure inline', async () => {
    const { files } = memory(
      {},
      {
        refresh: async () => {
          throw new Error('offline');
        },
      },
    );
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileBrowserView controller={controller} onOpenFile={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toBe('offline');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('FileEditorView', () => {
  it('shows the dirty indicator, then Saved; a failed save stays dirty with an error', async () => {
    let fail = true;
    const { map, files } = memory(
      { 'n.md': 'old' },
      {
        write: async () => {
          if (fail) throw new Error('conflict');
        },
      },
    );
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="n.md" mode="source" />);
    const field = await screen.findByLabelText('Content');
    expect(screen.getByText('No changes')).toBeTruthy();
    fireEvent.change(field, { target: { value: 'new' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('conflict');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    // Regression: the error used to render while Save was still busy, so this retry was dropped.
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-disabled')).not.toBe(
      'true',
    );
    fail = false;
    map.set('n.md', 'old');
    // findByRole resolves on the DOM change, before passive effects run; react-native-web's
    // Pressable applies its new `disabled` in useEffect, so flush effects or the tap is dropped.
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('submits the passphrase on enter and keeps it masked', async () => {
    const cipher = await encrypt('secret', 'pw');
    const { files } = memory({ 'v.md.enc': cipher });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="v.md.enc" mode="source" />);
    const input = (await screen.findByLabelText('Passphrase')) as HTMLInputElement;
    expect(input.type).toBe('password');
    expect((screen.getByRole('button', { name: 'Unlock' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(input, { target: { value: 'pw' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    const body = (await screen.findByLabelText('Content')) as HTMLTextAreaElement;
    expect(body.value).toBe('secret');
    expect(screen.getByText('Encrypted file')).toBeTruthy();
  });

  it('offers retry when the file cannot be opened', async () => {
    const { files } = memory(
      {},
      {
        read: async () => {
          throw new Error('missing');
        },
      },
    );
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="gone.md" />);
    expect(await screen.findByText("Couldn't open the file")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
  });
});

describe('FileEditorView source editor', () => {
  const field = async () => (await screen.findByLabelText('Content')) as HTMLTextAreaElement;
  const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it('formats markdown from the toolbar, with undo and redo', async () => {
    const { files } = memory({ 'n.md': 'milk' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="n.md" mode="source" />);
    const input = await field();
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    press('Checkbox');
    expect(input.value).toBe('- [ ] milk');
    press('Heading');
    expect(input.value).toBe('# milk');
    press('Undo');
    expect(input.value).toBe('- [ ] milk');
    press('Undo');
    expect(input.value).toBe('milk');
    press('Redo');
    expect(input.value).toBe('- [ ] milk');
  });

  it('continues a list on enter', async () => {
    const { files } = memory({ 'n.md': '- a' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="n.md" mode="source" />);
    const input = await field();
    fireEvent.change(input, { target: { value: '- a\n' } });
    expect(input.value).toBe('- a\n- ');
  });

  it('shows only undo/redo for non-markdown files', async () => {
    const { files } = memory({ 'c.json': '{}' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="c.json" mode="source" />);
    await field();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('autosaves after a pause in typing', async () => {
    const { map, files } = memory({ 'n.md': 'old' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="n.md" mode="source" autosaveMs={10} />);
    fireEvent.change(await field(), { target: { value: 'new' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(map.get('n.md')).toBe('new');
  });

  it('keeps typing done while a save is in flight', async () => {
    let finish = () => {};
    const { map, files } = memory(
      { 'n.md': 'a' },
      {
        write: (p, c) =>
          new Promise<void>((resolve) => {
            finish = () => {
              map.set(p, c);
              resolve();
            };
          }),
      },
    );
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(
      <FileEditorView controller={controller} path="n.md" mode="source" autosaveMs={60_000} />,
    );
    const input = await field();
    fireEvent.change(input, { target: { value: 'ab' } });
    press('Save');
    expect(screen.getByText('Saving…')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'abc' } });
    await act(async () => finish());
    expect(map.get('n.md')).toBe('ab');
    expect(input.value).toBe('abc');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('saves pending edits when the screen closes', async () => {
    const { map, files } = memory({ 'n.md': 'old' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    const view = render(
      <FileEditorView controller={controller} path="n.md" mode="source" autosaveMs={60_000} />,
    );
    fireEvent.change(await field(), { target: { value: 'kept' } });
    view.unmount();
    await waitFor(() => expect(map.get('n.md')).toBe('kept'));
  });
});

vi.mock('../files/feed-store.js', () => ({
  feedStore: { snapshot: () => ({}), subscribe: () => () => {}, ensure: async () => {} },
}));

/** Holds the mode like the route does, with a button standing in for the header toggle. */
function Harness({ controller, path }: { controller: FileEditorController; path: string }) {
  const [mode, setMode] = useState<FileMode>('view');
  return (
    <>
      <FileModeToggle mode={mode} onChange={setMode} />
      <FileEditorView controller={controller} path={path} mode={mode} />
    </>
  );
}

describe('FileEditorView viewers', () => {
  it('opens an .rss.json as the RSS tile, and View source switches to the editor', async () => {
    const { files } = memory({ 'f.rss.json': '{"feedOptions":[],"readLater":[]}' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<Harness controller={controller} path="f.rss.json" />);
    expect(await screen.findByTestId('tile-rss')).toBeTruthy();
    expect(screen.queryByLabelText('Content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View source' }));
    expect(await screen.findByLabelText('Content')).toBeTruthy();
    expect(screen.queryByTestId('tile-rss')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByTestId('tile-rss')).toBeTruthy();
  });

  it('writes from a viewer through edit and save', async () => {
    const { map, files } = memory({ 'f.travel.json': '' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="f.travel.json" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add trip' }));
    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Oslo' } });
    fireEvent.change(screen.getByLabelText('Start (YYYY-MM-DD)'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
    await waitFor(() =>
      expect(JSON.parse(map.get('f.travel.json') as string).trips).toHaveLength(1),
    );
  });

  it('opens an unknown kind in the editor with a no-viewer note', async () => {
    const { files } = memory({ 'd.drawio': '<mxfile/>' });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="d.drawio" />);
    expect(await screen.findByLabelText('Content')).toBeTruthy();
    expect(screen.getByText(/No viewer for \.drawio yet/)).toBeTruthy();
  });

  it('unlocks an encrypted markdown file into the reader', async () => {
    const cipher = await encrypt('# Secret title', 'pw');
    const { files } = memory({ 'v.md.enc': cipher });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="v.md.enc" />);
    fireEvent.change(await screen.findByLabelText('Passphrase'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { name: 'Secret title' })).toBeTruthy();
    expect(screen.getByText('Encrypted file')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeTruthy();
  });
});

describe('MoreView layout', () => {
  it('shows the signed-in account and repository, and separates sign out', () => {
    render(
      <MoreView
        onNavigate={vi.fn()}
        onSignOut={vi.fn()}
        version="1.2.3"
        account={{ name: 'Kai Human', login: 'kai' }}
        repo="kai/life"
      />,
    );
    expect(screen.getByText('Kai Human')).toBeTruthy();
    expect(screen.getByText('kai/life')).toBeTruthy();
    expect(screen.getByLabelText(/Signed in as Kai Human/)).toBeTruthy();
    for (const t of ['Analytics', 'Wiki', 'Knowledge', 'Files', 'Repositories', 'Sign out']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });
});
