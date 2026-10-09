import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_HOST, REPO_CHANGED_AT, syncRepoWithDesktop, watchRepoChanges } from './repo-sync';

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

let store: Record<string, unknown>;
let host: ReturnType<typeof vi.fn>;
let onChanged: ((changes: Changes, area: string) => void) | undefined;

beforeEach(() => {
  store = {};
  onChanged = undefined;
  host = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: { sendNativeMessage: host },
    storage: {
      local: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]])),
        set: async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        },
      },
      onChanged: {
        addListener: (listener: typeof onChanged) => {
          onChanged = listener;
        },
      },
    },
  });
});

describe('syncRepoWithDesktop', () => {
  it('sends the repository and when it changed, and takes the desktop’s newer one', async () => {
    store = { lifeos_repo: 'o/browser', [REPO_CHANGED_AT]: 10 };
    host.mockResolvedValue({ repo: 'o/desktop', changedAt: 20 });
    expect(await syncRepoWithDesktop()).toBe(true);
    expect(host).toHaveBeenCalledWith(NATIVE_HOST, {
      type: 'SYNC_REPO',
      repo: 'o/browser',
      changedAt: 10,
    });
    expect(store).toEqual({ lifeos_repo: 'o/desktop', [REPO_CHANGED_AT]: 20 });
  });

  it('sends no repository and no change time before either was stored', async () => {
    host.mockResolvedValue({ repo: '', changedAt: 0 });
    expect(await syncRepoWithDesktop()).toBe(false);
    expect(host).toHaveBeenCalledWith(NATIVE_HOST, {
      type: 'SYNC_REPO',
      repo: '',
      changedAt: 0,
    });
    expect(store).toEqual({});
  });

  it('takes the desktop’s repository when it has none of its own', async () => {
    host.mockResolvedValue({ repo: 'o/desktop', changedAt: 5 });
    expect(await syncRepoWithDesktop()).toBe(true);
    expect(store).toEqual({ lifeos_repo: 'o/desktop', [REPO_CHANGED_AT]: 5 });
  });

  it('keeps its own repository when no desktop palette answers', async () => {
    store = { lifeos_repo: 'o/browser' };
    host.mockRejectedValue(new Error('Specified native messaging host not found.'));
    expect(await syncRepoWithDesktop()).toBe(false);
    expect(store).toEqual({ lifeos_repo: 'o/browser' });
  });

  it('ignores an answer that is not a repository', async () => {
    store = { lifeos_repo: 'o/browser' };
    host.mockResolvedValue({ error: 'Malformed message' });
    expect(await syncRepoWithDesktop()).toBe(false);
    host.mockResolvedValue({ repo: '../x', changedAt: 1 });
    expect(await syncRepoWithDesktop()).toBe(false);
    expect(store.lifeos_repo).toBe('o/browser');
  });
});

describe('watchRepoChanges', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('stamps a repository chosen here and tells the desktop', async () => {
    host.mockImplementation(async (_host, message) => ({
      repo: message.repo,
      changedAt: message.changedAt,
    }));
    watchRepoChanges(() => 42);
    store.lifeos_repo = 'o/new';
    onChanged?.({ lifeos_repo: { oldValue: 'o/old', newValue: 'o/new' } }, 'local');
    await settle();
    expect(store[REPO_CHANGED_AT]).toBe(42);
    expect(host).toHaveBeenCalledWith(NATIVE_HOST, {
      type: 'SYNC_REPO',
      repo: 'o/new',
      changedAt: 42,
    });
  });

  it('leaves alone a change the sync made, an unchanged value and other storage', async () => {
    watchRepoChanges(() => 42);
    onChanged?.(
      { lifeos_repo: { oldValue: 'o/a', newValue: 'o/b' }, [REPO_CHANGED_AT]: { newValue: 7 } },
      'local',
    );
    onChanged?.({ lifeos_repo: { oldValue: 'o/a', newValue: 'o/a' } }, 'local');
    onChanged?.({ lifeos_repo: { oldValue: 'o/a', newValue: undefined } }, 'local');
    onChanged?.({ lifeos_repo: { oldValue: 'o/a', newValue: 'o/b' } }, 'session');
    await settle();
    expect(store[REPO_CHANGED_AT]).toBeUndefined();
    expect(host).not.toHaveBeenCalled();
  });
});
