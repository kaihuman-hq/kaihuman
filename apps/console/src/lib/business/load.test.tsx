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
const { useBacklinkContents, useBusinessRepo } = await import('./use-business-repo.js');

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
let links: Record<string, string>;
let linksEnabled = true;
const Probe = () => {
  state = useBusinessRepo();
  links = useBacklinkContents(linksEnabled);
  return null;
};
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
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
  linksEnabled = true;
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

const fixtureTree = () => [...fixture.keys()].map((p) => blob(p));
const fetched = () => core.getFileContent.mock.calls.map((c) => c[2] as string);

describe('useBusinessRepo tree handling', () => {
  it('loads the tree when it is empty, not when it already holds the current repo', async () => {
    core.tree.value = [];
    await mount();
    expect(core.loadTree).toHaveBeenCalledTimes(1);

    act(() => render(null, host));
    core.loadTree.mockClear();
    core.tree.value = [blob('notes/a.md')];
    await mount();
    expect(core.loadTree).not.toHaveBeenCalled();
  });

  it('is loading, fetches nothing and reloads the tree while the store holds another repo', async () => {
    core.tree.value = fixtureTree();
    core.loadedRepo.value = 'other/repo';
    await mount();
    expect(state.status).toBe('loading');
    expect(core.getFileContent).not.toHaveBeenCalled();
    expect(core.loadTree).toHaveBeenCalledTimes(1);
  });

  it('discards a result that lands after a repo switch', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    core.tree.value = fixtureTree();
    core.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => {
      await gate;
      return { content: fixture.get(path) ?? '' };
    });
    await mount();
    expect(state.status).toBe('loading');

    await act(async () => {
      core.currentRepo.value = { full_name: 'o/other' };
      core.loadedRepo.value = 'o/other';
      core.tree.value = [blob('notes/a.md')];
    });
    release();
    await settle();
    expect(state.status).toBe('disabled');
  });

  it('keeps the previous data while the same repo reloads after a sha change', async () => {
    core.tree.value = fixtureTree();
    await mount();
    expect(state.status).toBe('ready');

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    core.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) => {
      await gate;
      return { content: fixture.get(path) ?? '' };
    });
    await act(async () => {
      core.tree.value = fixtureTree().map((t) => ({ ...t, sha: `${t.sha}-new` }));
    });
    expect(state.status).toBe('ready');
    release();
    await settle();
    expect(state.status).toBe('ready');
  });
});

describe('useBacklinkContents', () => {
  const markdown = () => [
    blob('.kh/wiki/a.md'),
    blob('.kh/ideas/b.md'),
    blob('.kh/wiki/img.png'),
    blob('docs/c.md'),
    blob('.kh/business/business.yaml'),
  ];

  it('fetches nothing while disabled', async () => {
    linksEnabled = false;
    core.tree.value = markdown();
    await mount();
    await settle();
    expect(links).toEqual({});
    expect(fetched().filter((p) => p.endsWith('.md'))).toEqual([]);
  });

  it('fetches only wiki and ideas Markdown once enabled', async () => {
    core.tree.value = markdown();
    await mount();
    await settle();
    expect(
      fetched()
        .filter((p) => p.endsWith('.md'))
        .sort(),
    ).toEqual(['.kh/ideas/b.md', '.kh/wiki/a.md']);
    expect(Object.keys(links).sort()).toEqual(['.kh/ideas/b.md', '.kh/wiki/a.md']);
  });

  it('respects the 300 file cap', async () => {
    core.tree.value = Array.from({ length: 305 }, (_, i) => blob(`.kh/wiki/n${i}.md`));
    await mount();
    await settle();
    expect(fetched()).toHaveLength(300);
  });

  it('clears the contents at once on a repo switch', async () => {
    core.tree.value = markdown();
    await mount();
    await settle();
    expect(Object.keys(links)).toHaveLength(2);

    await act(async () => {
      core.currentRepo.value = { full_name: 'o/other' };
    });
    expect(links).toEqual({});
    core.loadedRepo.value = 'o/other';
    core.tree.value = [blob('.kh/wiki/z.md')];
    await settle();
    expect(Object.keys(links)).toEqual(['.kh/wiki/z.md']);
  });
});
