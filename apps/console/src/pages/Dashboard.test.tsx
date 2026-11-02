import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const B = '.kh/business';
const FROZEN = `${B}/invoices/2026/RE-2026-0001.yaml`;
const h = vi.hoisted(() => ({
  main: {} as Record<string, (...a: unknown[]) => Promise<void> | void>,
  store: {
    deleteFile: vi.fn(),
    createFile: vi.fn(),
    openFile: vi.fn(),
    renameFile: vi.fn(),
    renameFolder: vi.fn(),
    updateFileContent: vi.fn(),
    saveFile: vi.fn(),
  },
}));

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  const noop = () => {};
  return {
    Logger: class {
      debug = noop;
      info = noop;
      warn = noop;
      error = noop;
    },
    authStore: { token: signal(null), isAuthenticated: signal(true) },
    githubProfileStore: {
      currentRepo: signal({ full_name: 'me/biz' }),
      repos: signal([]),
      fetchRepos: noop,
    },
    layoutStore: {
      columns: signal([]),
      remoteConfig: signal(null),
      activeDashboardId: signal(null),
    },
    githubFileStore: Object.assign(h.store, {
      tree: signal([
        { path: FROZEN, type: 'blob' },
        { path: `${B}/invoices/2026/RE-2026-0001.pdf`, type: 'blob' },
        { path: 'notes/a.md', type: 'blob' },
      ]),
      openFiles: signal({}),
      appFolder: signal('.kaihuman'),
      migrateAppFolder: async () => {},
      loadTree: async () => {},
    }),
  };
});
vi.mock('@kaihuman/ui', () => ({
  DEFAULT_CONFIG: {},
  parseReadItLater: () => ({}),
  serializeReadItLater: () => '',
  RepositorySelector: () => null,
  MainApp: (props: typeof h.main) => {
    Object.assign(h.main, props);
    return null;
  },
}));
vi.mock('preact-router', () => ({ route: vi.fn() }));
vi.mock('../components/FileViewer', () => ({ FileViewer: () => null }));
vi.mock('../components/KBCommandsModal', () => ({ KBCommandsModal: () => null }));
vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: preact.ComponentChildren }) => <>{children}</>,
}));
vi.mock('./ShortcutsPage', () => ({ QUICK_ROUTES: [] }));

const { Dashboard } = await import('./Dashboard');

const MESSAGE =
  'Issued documents never change. To correct an invoice, issue a credit note from the client page.';
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Dashboard />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.unstubAllGlobals();
});

const call = async (name: string, ...args: unknown[]) => {
  await act(async () => {
    await h.main[name]?.(...args);
  });
};

describe('Dashboard refuses to change issued documents', () => {
  it('delete does nothing and shows the message', async () => {
    await call('onDeleteFile', FROZEN);
    expect(h.store.deleteFile).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(MESSAGE);
  });

  it('change, rename and move do nothing', async () => {
    await call('onFileChange', FROZEN, 'x');
    await call('onRenameFile', FROZEN, `${B}/invoices/2026/other.yaml`);
    await call('onMoveFile', `${B}/invoices/2026/RE-2026-0001.pdf`, 'elsewhere/x.pdf');
    expect(h.store.updateFileContent).not.toHaveBeenCalled();
    expect(h.store.saveFile).not.toHaveBeenCalled();
    expect(h.store.renameFile).not.toHaveBeenCalled();
  });

  it('folder rename and delete are refused when issued files are inside', async () => {
    await call('onRenameFolder', `${B}/invoices/2026`, `${B}/invoices/2027`);
    await call('onRenameFolder', B, 'other');
    await call('onDeleteFile', `${B}/invoices`);
    expect(h.store.renameFolder).not.toHaveBeenCalled();
    expect(h.store.deleteFile).not.toHaveBeenCalled();
  });

  it('refuses a destination or new file that would overwrite issued documents', async () => {
    await call('onRenameFolder', 'notes', `${B}/invoices/2026`);
    await call('onRenameFile', 'notes/a.md', FROZEN);
    await call('onMoveFile', 'notes/a.md', FROZEN);
    await call('onCreateFile', FROZEN, 'x');
    expect(h.store.renameFolder).not.toHaveBeenCalled();
    expect(h.store.renameFile).not.toHaveBeenCalled();
    expect(h.store.createFile).not.toHaveBeenCalled();
  });

  it('still creates a new artifact next to issued files', async () => {
    await call('onCreateFile', `${B}/invoices/2026/RE-2026-0002.pdf`, '');
    expect(h.store.createFile).toHaveBeenCalled();
  });

  it('other files still change, rename, move and delete', async () => {
    await call('onFileChange', 'notes/a.md', 'x');
    await call('onRenameFile', 'notes/a.md', 'notes/b.md');
    await call('onMoveFile', 'notes/a.md', 'z/a.md');
    await call('onRenameFolder', 'notes', 'memo');
    await call('onDeleteFile', 'notes/a.md');
    expect(h.store.saveFile).toHaveBeenCalledWith('notes/a.md');
    expect(h.store.renameFile).toHaveBeenCalledTimes(2);
    expect(h.store.renameFolder).toHaveBeenCalledWith('notes', 'memo');
    expect(h.store.deleteFile).toHaveBeenCalledWith('notes/a.md');
  });
});
