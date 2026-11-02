import type { signal } from '@preact/signals';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  tree: undefined as unknown as ReturnType<typeof signal<unknown[]>>,
  isLoading: undefined as unknown as ReturnType<typeof signal<boolean>>,
  error: undefined as unknown as ReturnType<typeof signal<string | null>>,
  loadedRepo: undefined as unknown as ReturnType<typeof signal<string | null>>,
  currentRepo: undefined as unknown as ReturnType<typeof signal<unknown>>,
  loadTree: vi.fn(),
  getFileContent: vi.fn(),
}));

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  core.tree = signal<unknown[]>([]);
  core.isLoading = signal(false);
  core.error = signal<string | null>(null);
  core.loadedRepo = signal<string | null>('o/biz');
  core.currentRepo = signal<unknown>({ full_name: 'o/biz' });
  return {
    githubFileStore: {
      tree: core.tree,
      isLoading: core.isLoading,
      error: core.error,
      loadedRepo: core.loadedRepo,
      loadTree: core.loadTree,
    },
    githubProfileStore: { currentRepo: core.currentRepo },
    githubService: { getFileContent: core.getFileContent },
  };
});

const { loadFixtureRepo } = await import('./fixture.test-helper.js');
const { useBusinessRepo } = await import('./use-business-repo.js');

import type { BusinessState } from './use-business-repo.js';

// The sha cache outlives a test, so every test gets fresh shas.
let run = 0;
const blob = (path: string, sha = `${path}#${run}`) => ({
  path,
  sha,
  type: 'blob',
  mode: '100644',
  url: '',
});
const fixture = loadFixtureRepo();

let host: HTMLDivElement;
let state: BusinessState;
const Probe = () => {
  state = useBusinessRepo();
  return null;
};
const mount = async () => {
  await act(async () => {
    render(<Probe />, host);
  });
  // File fetches resolve over several ticks.
  for (let i = 0; i < 20 && state.status === 'loading'; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  run += 1;
  core.isLoading.value = false;
  core.error.value = null;
  core.loadedRepo.value = 'o/biz';
  core.currentRepo.value = { full_name: 'o/biz' };
  core.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => ({
    content: fixture.get(path) ?? '',
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('useBusinessRepo', () => {
  it('is no-repo without a current repo', async () => {
    core.currentRepo.value = null;
    core.tree.value = [];
    await mount();
    expect(state.status).toBe('no-repo');
  });

  it('is disabled when the tree has no business.yaml, fetching nothing', async () => {
    core.tree.value = [blob('notes/a.md')];
    await mount();
    expect(state.status).toBe('disabled');
    expect(core.getFileContent).not.toHaveBeenCalled();
  });

  it('is ready with the fixture clients, fetching only business data files', async () => {
    core.tree.value = [...fixture.keys()].map((p) => blob(p));
    core.tree.value = [...core.tree.value, blob('.kh/business/.tools/business-check.mjs')];
    await mount();
    if (state.status !== 'ready') throw new Error(`status ${state.status}`);
    expect(state.data.clients).toHaveLength(1);
    expect(state.loadErrors).toEqual([]);
    const fetched = core.getFileContent.mock.calls.map((c) => c[2] as string);
    expect(fetched).not.toContain('.kh/business/.tools/business-check.mjs');
  });

  it('keeps rendering when one file is broken and names it in the findings', async () => {
    core.tree.value = [...fixture.keys()].map((p) => blob(p));
    core.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => ({
      content: path.endsWith('client.yaml') ? 'name: [unclosed' : (fixture.get(path) ?? ''),
    }));
    await mount();
    if (state.status !== 'ready') throw new Error(`status ${state.status}`);
    expect(state.data.findings.some((f) => f.file.endsWith('client.yaml'))).toBe(true);
    expect(state.data.issued.length).toBeGreaterThan(0);
  });

  it('puts fetch failures in loadErrors', async () => {
    core.tree.value = [...fixture.keys()].map((p) => blob(p));
    core.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => {
      if (path.endsWith('events.jsonl')) throw new Error('offline');
      return { content: fixture.get(path) ?? '' };
    });
    await mount();
    if (state.status !== 'ready') throw new Error(`status ${state.status}`);
    expect(state.loadErrors).toEqual(['.kh/business/events.jsonl: offline']);
  });

  it('is an error when the tree failed to load', async () => {
    core.tree.value = [];
    core.error.value = 'rate limited';
    await mount();
    expect(state).toEqual({ status: 'error', message: 'rate limited' });
  });
});
