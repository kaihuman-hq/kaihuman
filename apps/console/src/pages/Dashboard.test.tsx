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
    ensureFresh: vi.fn(),
    renameFile: vi.fn(),
    renameFolder: vi.fn(),
    updateFileContent: vi.fn(),
    saveFile: vi.fn(),
    migrateAppFolder: vi.fn(async () => {}),
    loadTree: vi.fn(async () => {}),
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
      error: signal(null),
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

const { Dashboard, normalizeConfig } = await import('./Dashboard');
const core = (await import('@kaihuman/core')) as unknown as {
  githubFileStore: { tree: { value: unknown[] }; error: { value: string | null } };
  layoutStore: { remoteConfig: { value: unknown } };
};

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

  it('refuses to create, rename or move to a new issued-document path, though nothing exists there', async () => {
    const fresh = `${B}/invoices/2026/RE-2026-0099.yaml`;
    await call('onCreateFile', fresh, 'x');
    await call('onRenameFile', 'notes/a.md', fresh);
    await call('onMoveFile', 'notes/a.md', fresh);
    expect(h.store.createFile).not.toHaveBeenCalled();
    expect(h.store.renameFile).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(MESSAGE);
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

describe('Dashboard never stays on the config spinner', () => {
  const rerender = async () => {
    act(() => render(null, host));
    core.layoutStore.remoteConfig.value = null;
    await act(async () => {
      render(<Dashboard />, host);
    });
    await act(async () => {});
  };

  it('a failing load shows the default layout with an error and Retry', async () => {
    h.store.migrateAppFolder.mockRejectedValueOnce(new Error('Update is not a fast forward'));
    await rerender();
    expect(host.textContent).not.toContain('Loading Dashboard Configuration');
    expect(core.layoutStore.remoteConfig.value).toMatchObject({ entries: [] });
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Update is not a fast forward');

    const calls = h.store.migrateAppFolder.mock.calls.length;
    await act(async () => {
      (alert?.querySelector('button') as HTMLButtonElement).click();
    });
    await act(async () => {});
    expect(h.store.migrateAppFolder.mock.calls.length).toBe(calls + 1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a tree load error with Retry instead of the spinner', async () => {
    const tree = core.githubFileStore.tree.value;
    core.githubFileStore.tree.value = [];
    core.githubFileStore.error.value = 'Bad credentials';
    try {
      await rerender();
      const alert = host.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('Bad credentials');
      (alert?.querySelector('button') as HTMLButtonElement).click();
      expect(h.store.loadTree).toHaveBeenCalled();
    } finally {
      core.githubFileStore.tree.value = tree;
      core.githubFileStore.error.value = null;
    }
  });

  it('normalizeConfig tolerates a config without entries or dashboards', () => {
    const c = normalizeConfig({ version: 1, files: { recentlyOpened: [] } });
    expect(c.entries).toEqual([]);
    expect(c.dashboards).toEqual([{ id: 'default', name: 'Main' }]);
    expect(
      normalizeConfig({ entries: [{ path: 'a', dashboard: 'd' }] as never }).entries,
    ).toHaveLength(1);
  });
});
