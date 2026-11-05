import '../db.js';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryGithubService } from '../services/github.service.memory.js';

vi.mock('../services/github.service.js', async () => {
  const { InMemoryGithubService } = await import('../services/github.service.memory.js');
  return { githubService: new InMemoryGithubService() };
});

import { githubService } from '../services/github.service.js';
import { GithubFileStore } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';

const remote = githubService as unknown as InMemoryGithubService;
const FILE = 'notes.md';
const V0 = 'a\nb\nc\nd\ne\n';

const stores: GithubFileStore[] = [];
const device = () => {
  const s = new GithubFileStore();
  stores.push(s);
  return s;
};
const remoteText = async (path = FILE) => (await remote.getFileContent('o', 'r', path)).content;
/** Commits `content` as another device would, against the current remote sha. */
const pushRemote = async (content: string, path = FILE) => {
  const { sha } = await remote.getFileContent('o', 'r', path);
  await remote.saveFile('o', 'r', path, content, 'other device', sha);
};
const clearIdb = async () => {
  const db = await openDB('life-os-db', 1);
  await db.clear('files');
  await db.clear('trees');
  db.close();
};

beforeEach(async () => {
  githubProfileStore.currentRepo.value = {
    full_name: 'o/r',
    name: 'r',
    owner: { login: 'o' },
    default_branch: 'main',
  } as never;
  remote.load({ [FILE]: V0 }, []);
  await clearIdb();
});

afterEach(async () => {
  for (const s of stores.splice(0)) await s.flushPendingWrites();
  await clearIdb();
  vi.restoreAllMocks();
});

describe('sync: two devices saving the same file (cause 1)', () => {
  it('merges non-overlapping edits instead of overwriting the newer remote', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);

    a.updateFileContent(FILE, 'A\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    b.updateFileContent(FILE, 'a\nb\nc\nd\nE\n');
    await b.saveFile(FILE);

    expect(await remoteText()).toBe('A\nb\nc\nd\nE\n');
    expect(b.dirtyFiles.value.has(FILE)).toBe(false);
    expect(b.openFiles.value[FILE]?.content).toBe('A\nb\nc\nd\nE\n');
    expect(b.fileConflicts.value).toEqual({});
    expect(b.error.value).toBeNull();
  });

  it('reports a conflict for overlapping edits and leaves the remote at v1', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);

    a.updateFileContent(FILE, 'A1\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    b.updateFileContent(FILE, 'B1\nb\nc\nd\ne\n');
    await b.saveFile(FILE);

    expect(await remoteText()).toBe('A1\nb\nc\nd\ne\n');
    expect(b.fileConflicts.value[FILE]).toMatchObject({
      localContent: 'B1\nb\nc\nd\ne\n',
      remoteContent: 'A1\nb\nc\nd\ne\n',
    });
    expect(b.dirtyFiles.value.has(FILE)).toBe(true);
    expect(b.openFiles.value[FILE]?.content).toBe('B1\nb\nc\nd\ne\n');
    expect(b.error.value).toBeNull();
  });

  it('merges a todo added on one device with a todo toggled on the other', async () => {
    const todos = 'x.todos.md';
    const items = ['- [ ] first', '- [ ] second', '- [ ] third', '- [ ] fourth'];
    const v0 = `${items.join('\n')}\n`;
    remote.load({ [todos]: v0 }, []);

    const a = device();
    const b = device();
    await a.openFile(todos);
    await b.openFile(todos);

    a.updateFileContent(todos, `${v0}- [ ] fifth\n`);
    await a.saveFile(todos);
    b.updateFileContent(todos, v0.replace('- [ ] first', '- [x] first'));
    await b.saveFile(todos);

    expect(await remoteText(todos)).toBe(
      '- [x] first\n- [ ] second\n- [ ] third\n- [ ] fourth\n- [ ] fifth\n',
    );
    expect(b.dirtyFiles.value.has(todos)).toBe(false);
  });
});

describe('sync: resolveConflict', () => {
  it('keep_local does not overwrite a remote change made after the conflict', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);
    a.updateFileContent(FILE, 'A1\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    b.updateFileContent(FILE, 'B1\nb\nc\nd\ne\n');
    await b.saveFile(FILE);
    expect(b.fileConflicts.value[FILE]).toBeDefined();

    b.resolveConflict(FILE, 'keep_local');
    expect(b.fileConflicts.value).toEqual({});
    expect(b.dirtyFiles.value.has(FILE)).toBe(true);

    // The remote moves on again before B saves.
    a.updateFileContent(FILE, 'A1\nb\nc\nd\nE2\n');
    await a.saveFile(FILE);
    await b.saveFile(FILE);

    // B's choice wins over the version B saw (A1), and A's newer edit (E2) survives.
    expect(await remoteText()).toBe('B1\nb\nc\nd\nE2\n');
    expect(b.dirtyFiles.value.has(FILE)).toBe(false);
  });

  it('keep_local followed by an overlapping remote change conflicts again', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);
    a.updateFileContent(FILE, 'A1\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    b.updateFileContent(FILE, 'B1\nb\nc\nd\ne\n');
    await b.saveFile(FILE);
    b.resolveConflict(FILE, 'keep_local');

    a.updateFileContent(FILE, 'A2\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    await b.saveFile(FILE);

    expect(await remoteText()).toBe('A2\nb\nc\nd\ne\n');
    expect(b.fileConflicts.value[FILE]?.remoteContent).toBe('A2\nb\nc\nd\ne\n');
  });

  it('use_remote takes the remote copy and persists it clean', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);
    a.updateFileContent(FILE, 'A1\nb\nc\nd\ne\n');
    await a.saveFile(FILE);
    b.updateFileContent(FILE, 'B1\nb\nc\nd\ne\n');
    await b.saveFile(FILE);

    b.resolveConflict(FILE, 'use_remote');
    await b.flushPendingWrites();
    expect(b.openFiles.value[FILE]?.content).toBe('A1\nb\nc\nd\ne\n');
    expect(b.dirtyFiles.value.has(FILE)).toBe(false);
    await vi.waitFor(async () => {
      const db = await openDB('life-os-db', 1);
      const rec = await db.get('files', `o/r:${FILE}`);
      db.close();
      expect(rec).toMatchObject({ content: 'A1\nb\nc\nd\ne\n', dirty: false });
    });
  });
});

describe('sync: unsaved edits survive a reload (cause 3)', () => {
  const editThenReload = async (edit: string) => {
    const before = device();
    await before.openFile(FILE);
    before.updateFileContent(FILE, edit);
    await before.flushPendingWrites();
    return device();
  };

  it('keeps the unsaved edit and its dirty flag', async () => {
    const after = await editThenReload('a\nb\nLOCAL\nd\ne\n');
    await after.openFile(FILE);
    expect(after.openFiles.value[FILE]?.content).toBe('a\nb\nLOCAL\nd\ne\n');
    expect(after.dirtyFiles.value.has(FILE)).toBe(true);

    await after.saveFile(FILE);
    expect(await remoteText()).toBe('a\nb\nLOCAL\nd\ne\n');
  });

  it('merges the edit with a non-overlapping remote change made meanwhile', async () => {
    const after = await editThenReload('a\nb\nLOCAL\nd\ne\n');
    await pushRemote('REMOTE\nb\nc\nd\ne\n');
    await after.openFile(FILE);
    expect(after.openFiles.value[FILE]?.content).toBe('REMOTE\nb\nLOCAL\nd\ne\n');
    expect(after.dirtyFiles.value.has(FILE)).toBe(true);
  });

  it('reads the base by blob sha when the cached record has no base content', async () => {
    const after = await editThenReload('a\nb\nLOCAL\nd\ne\n');
    const db = await openDB('life-os-db', 1);
    const rec = await db.get('files', `o/r:${FILE}`);
    delete rec.baseContent;
    await db.put('files', rec);
    db.close();
    await pushRemote('REMOTE\nb\nc\nd\ne\n');
    await after.openFile(FILE);
    expect(after.openFiles.value[FILE]?.content).toBe('REMOTE\nb\nLOCAL\nd\ne\n');
  });

  it('shows a conflict, and keeps the local edit, when the remote changed the same line', async () => {
    const after = await editThenReload('a\nb\nLOCAL\nd\ne\n');
    await pushRemote('a\nb\nREMOTE\nd\ne\n');
    await after.openFile(FILE);
    expect(after.openFiles.value[FILE]?.content).toBe('a\nb\nLOCAL\nd\ne\n');
    expect(after.dirtyFiles.value.has(FILE)).toBe(true);
    expect(after.fileConflicts.value[FILE]?.remoteContent).toBe('a\nb\nREMOTE\nd\ne\n');
  });

  it('reconciles an in-memory dirty file instead of clobbering it on re-open', async () => {
    const s = device();
    await s.openFile(FILE);
    s.updateFileContent(FILE, 'a\nb\nLOCAL\nd\ne\n');
    await pushRemote('REMOTE\nb\nc\nd\ne\n');
    await s.openFile(FILE);
    expect(s.openFiles.value[FILE]?.content).toBe('REMOTE\nb\nLOCAL\nd\ne\n');
    expect(s.dirtyFiles.value.has(FILE)).toBe(true);
  });
});

describe('sync: 409 retry (cause 4)', () => {
  it('saves in one retry because reconcile reads the fresh remote', async () => {
    const a = device();
    const b = device();
    await a.openFile(FILE);
    await b.openFile(FILE);
    a.updateFileContent(FILE, 'A\nb\nc\nd\ne\n');
    await a.saveFile(FILE);

    const save = vi.spyOn(remote, 'saveFile');
    b.updateFileContent(FILE, 'a\nb\nc\nd\nE\n');
    await b.saveFile(FILE);
    expect(save).toHaveBeenCalledTimes(2);
    expect(await remoteText()).toBe('A\nb\nc\nd\nE\n');
  });

  it('treats a dirty file deleted remotely as a conflict', async () => {
    const s = device();
    await s.openFile(FILE);
    s.updateFileContent(FILE, 'edited\n');
    await remote.deleteFile('o', 'r', FILE, 'gone', '');
    expect(await s.reconcile(FILE)).toBe('conflict');
    expect(s.fileConflicts.value[FILE]).toMatchObject({ remoteContent: '', remoteSha: '' });
  });
});

/** A promise with its resolve exposed, to pause a fake network call mid-flight. */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/** Makes the next `method` call do its work, then wait for `gate` before returning. */
const pauseNext = (method: 'saveFile' | 'getFileContent') => {
  const reached = deferred();
  const gate = deferred();
  const original = (remote[method] as (...args: unknown[]) => Promise<unknown>).bind(remote);
  vi.spyOn(remote, method).mockImplementationOnce((async (...args: unknown[]) => {
    const result = await original(...args);
    reached.resolve();
    await gate.promise;
    return result;
  }) as never);
  return { reached: reached.promise, release: gate.resolve };
};

describe('sync: races between a save and a reconcile', () => {
  it('keeps the sha and base a reconcile set while the save was in flight', async () => {
    const s = device();
    await s.openFile(FILE);
    s.updateFileContent(FILE, 'A\nb\nc\nd\ne\n');
    const put = pauseNext('saveFile');
    const saving = s.saveFile(FILE);
    await put.reached;

    // Another device builds on our landed save; we reconcile before our PUT returns.
    await pushRemote('A\nb\nc\nd\nE\n');
    await s.reconcile(FILE);
    put.release();
    await saving;

    const latest = await remote.getFileContent('o', 'r', FILE);
    expect(s.openFiles.value[FILE]).toEqual({
      content: latest.content,
      sha: latest.sha,
      base: latest.content,
    });
    expect(s.dirtyFiles.value.has(FILE)).toBe(false);
  });

  it('does not replace a just-saved copy with a remote fetched before the save landed', async () => {
    const s = device();
    await s.openFile(FILE);
    const get = pauseNext('getFileContent');
    const opening = s.openFile(FILE);
    await get.reached;

    s.updateFileContent(FILE, 'SAVED\nb\nc\nd\ne\n');
    await s.saveFile(FILE);
    const saved = await remote.getFileContent('o', 'r', FILE);
    get.release();
    await opening;

    expect(s.openFiles.value[FILE]?.content).toBe('SAVED\nb\nc\nd\ne\n');
    expect(s.openFiles.value[FILE]?.sha).toBe(saved.sha);
    await s.flushPendingWrites();
    const db = await openDB('life-os-db', 1);
    const rec = await db.get('files', `o/r:${FILE}`);
    db.close();
    expect(rec.content).toBe('SAVED\nb\nc\nd\ne\n');
  });
});

describe('sync: discardLocal', () => {
  it('drops the memory copy, dirty flag, conflict, pending cache write and cache record', async () => {
    const s = device();
    vi.spyOn(remote, 'saveFile').mockRejectedValueOnce(new Error('offline'));
    await s.createFile('new.md', 'draft\n');
    expect(s.dirtyFiles.value.has('new.md')).toBe(true);
    s.updateFileContent('new.md', 'draft 2\n'); // leaves a debounced cache write pending
    s.fileConflicts.value = {
      'new.md': { localContent: 'x', remoteContent: 'y', remoteSha: 'z' },
    };

    await s.discardLocal('new.md');
    await s.flushPendingWrites();
    await new Promise((r) => setTimeout(r, 600));

    expect(s.openFiles.value['new.md']).toBeUndefined();
    expect(s.dirtyFiles.value.has('new.md')).toBe(false);
    expect(s.fileConflicts.value).toEqual({});
    const db = await openDB('life-os-db', 1);
    const rec = await db.get('files', 'o/r:new.md');
    db.close();
    expect(rec).toBeUndefined();
  });
});

describe('sync: repo switch', () => {
  it('writes the pending edit under the old repo and resets dirty and conflicts', async () => {
    const s = device();
    await s.loadTree();
    await s.openFile(FILE);
    s.updateFileContent(FILE, 'a\nb\nPENDING\nd\ne\n');
    s.fileConflicts.value = { [FILE]: { localContent: 'x', remoteContent: 'y', remoteSha: 'z' } };

    githubProfileStore.currentRepo.value = {
      full_name: 'o/r2',
      name: 'r2',
      owner: { login: 'o' },
      default_branch: 'main',
    } as never;
    await s.loadTree();
    await new Promise((r) => setTimeout(r, 600));

    expect(s.dirtyFiles.value.size).toBe(0);
    expect(s.fileConflicts.value).toEqual({});
    const db = await openDB('life-os-db', 1);
    const old = await db.get('files', `o/r:${FILE}`);
    const wrong = await db.get('files', `o/r2:${FILE}`);
    db.close();
    expect(old).toMatchObject({ content: 'a\nb\nPENDING\nd\ne\n', dirty: true });
    expect(wrong).toBeUndefined();
  });
});
