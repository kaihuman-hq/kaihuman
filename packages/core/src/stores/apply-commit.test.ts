import '../db.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openLifeOsDb } from './idb-test-helper.js';

const remote = vi.hoisted(() => ({ tree: [] as unknown[] }));
vi.mock('../services/github.service.js', () => ({
  githubService: { fetchRepoTree: async () => remote.tree, getHeadSha: async () => 'head' },
}));

import { GithubFileStore } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';

const DRAFT = '.kh/business/drafts/X.yaml';
const blob = (path: string, sha: string) => ({
  path,
  mode: '100644',
  type: 'blob',
  sha,
  url: '',
});

describe('githubFileStore.applyCommit', () => {
  let store: GithubFileStore;
  beforeEach(() => {
    githubProfileStore.currentRepo.value = {
      full_name: 'o/r',
      name: 'r',
      owner: { login: 'o' },
      default_branch: 'main',
    } as never;
    store = new GithubFileStore();
  });

  it('does not resurrect a deleted draft when loadTree sees a stale remote tree', async () => {
    remote.tree = [blob(DRAFT, 's1'), blob('keep.md', 'k1')];
    await store.loadTree();
    // The draft was opened once, so IDB holds its content (the case the merge keys on).
    await store.applyCommit({ [DRAFT]: 'draft: 1' }, { [DRAFT]: 's2' });
    expect(store.tree.value.find((t) => t.path === DRAFT)?.sha).toBe('s2');

    await store.applyCommit({ [DRAFT]: null, 'new.md': 'n' }, { 'new.md': 'n1' });
    expect(store.tree.value.map((t) => t.path)).toEqual(['keep.md', 'new.md']);

    // Stale API still lists the draft (as last committed, s2) and not the new file.
    remote.tree = [blob(DRAFT, 's2'), blob('keep.md', 'k1')];
    await store.loadTree();
    const paths = store.tree.value.map((t) => t.path);
    expect(paths).not.toContain(DRAFT);
    expect(paths).toContain('new.md');
  });

  it('shows a path another device re-created with a different sha', async () => {
    remote.tree = [blob(DRAFT, 's1')];
    await store.loadTree();
    await store.applyCommit({ [DRAFT]: null }, {});
    remote.tree = [blob(DRAFT, 'other-device')];
    await store.loadTree();
    expect(store.tree.value.map((t) => t.path)).toContain(DRAFT);
    // tombstone is gone: it stays visible on the next load too
    await store.loadTree();
    expect(store.tree.value.map((t) => t.path)).toContain(DRAFT);
  });

  it('removes the deleted path from the IDB files cache', async () => {
    await store.applyCommit({ [DRAFT]: 'd' }, { [DRAFT]: 's' });
    const db = await openLifeOsDb();
    expect(await db.get('files', `o/r:${DRAFT}`)).toBeDefined();
    await store.applyCommit({ [DRAFT]: null }, {});
    expect(await db.get('files', `o/r:${DRAFT}`)).toBeUndefined();
    db.close();
  });

  it('replaces open files and closes deleted ones', async () => {
    store.openFiles.value = {
      'a.md': { content: 'old', sha: 'o' },
      'b.md': { content: 'b', sha: 'b' },
    };
    store.activeFile.value = 'b.md';
    await store.applyCommit({ 'a.md': 'new', 'b.md': null }, { 'a.md': 'sha-a' });
    expect(store.openFiles.value).toEqual({
      'a.md': { content: 'new', sha: 'sha-a', base: 'new' },
    });
    expect(store.activeFile.value).toBeNull();
  });

  it('records a binary file in the tree and caches no text for it', async () => {
    remote.tree = [];
    await store.loadTree();
    const png = 'expenses/2026/X.png';
    store.openFiles.value = { [png]: { content: 'stale text', sha: 'old' } };
    await store.applyCommit({ [png]: new Uint8Array([0, 255, 1]) }, { [png]: 'binsha' });
    expect(store.tree.value.find((t) => t.path === png)?.sha).toBe('binsha');
    expect(store.openFiles.value[png]).toBeUndefined();
    // IDB held text for the path before; binary must not leave it (or add any) there.
    const db = await openLifeOsDb();
    await db.put('files', { path: `o/r:${png}`, content: 'stale', sha: 'old', timestamp: 1 });
    await store.applyCommit({ [png]: new Uint8Array([9]) }, { [png]: 'binsha2' });
    expect(await db.get('files', `o/r:${png}`)).toBeUndefined();
    db.close();
  });

  it('keeps a just-committed binary file through a lagging listing, then stops tracking it', async () => {
    const png = 'expenses/2026/X.png';
    remote.tree = [blob('keep.md', 'k1')];
    await store.loadTree();
    await store.applyCommit({ [png]: new Uint8Array([0, 255, 1]) }, { [png]: 'binsha' });
    // GitHub's listing does not have it yet.
    await store.loadTree();
    expect(store.tree.value.find((t) => t.path === png)?.sha).toBe('binsha');
    // Now it does: listed once, no duplicate.
    remote.tree = [blob('keep.md', 'k1'), blob(png, 'binsha')];
    await store.loadTree();
    expect(store.tree.value.filter((t) => t.path === png)).toHaveLength(1);
    // Marker cleared: if the file is later gone remotely, it is not resurrected.
    remote.tree = [blob('keep.md', 'k1')];
    await store.loadTree();
    expect(store.tree.value.map((t) => t.path)).not.toContain(png);
  });
});
