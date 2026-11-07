import { webcrypto } from 'node:crypto';
import { encrypt, type TreeItem } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ContentFiles,
  FileEditorController,
  type PasswordPort,
} from '../screens/file-editor-screen.js';
import { FileBrowserView, FileEditorView } from './file-editor-view.js';
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
    render(<FileEditorView controller={controller} path="n.md" />);
    const field = await screen.findByLabelText('Content');
    expect(screen.getByText('No changes')).toBeTruthy();
    fireEvent.change(field, { target: { value: 'new' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('conflict');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fail = false;
    map.set('n.md', 'old');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('submits the passphrase on enter and keeps it masked', async () => {
    const cipher = await encrypt('secret', 'pw');
    const { files } = memory({ 'v.md.enc': cipher });
    const controller = new FileEditorController({ files, passwords: passwords() });
    render(<FileEditorView controller={controller} path="v.md.enc" />);
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
