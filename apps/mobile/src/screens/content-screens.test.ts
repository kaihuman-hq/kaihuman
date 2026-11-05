import type { TreeItem } from '@kaihuman/core';
import { type IdeaSlug, newIdea } from '@kaihuman/formats';
import { describe, expect, it, vi } from 'vitest';
import {
  type ContentFiles,
  FileEditorController,
  type PasswordPort,
} from './file-editor-screen.js';
import { activityStrip, IdeasScreenController } from './ideas-screen.js';
import { KnowledgeScreenController, rawNote } from './knowledge-screen.js';
import { WikiScreenController } from './wiki-screen.js';

const NOW = new Date(2026, 10, 5, 12, 0);

const memoryFiles = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  const files: ContentFiles = {
    tree: () =>
      [...map.keys()].map(
        (path): TreeItem => ({ path, mode: '100644', type: 'blob', sha: path, url: '' }),
      ),
    refresh: async () => {},
    read: async (path) => {
      const content = map.get(path);
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    },
    write: async (path, content) => {
      if (!map.has(path)) throw new Error(`missing ${path}`);
      map.set(path, content);
    },
    create: async (path, content) => {
      if (map.has(path)) throw new Error(`exists ${path}`);
      map.set(path, content);
    },
    remove: async (path) => void map.delete(path),
    rename: async (from, to) => {
      map.set(to, map.get(from) ?? '');
      map.delete(from);
    },
  };
  return { map, files };
};

const idea = (title: string, at: Date, extra: Partial<Parameters<typeof newIdea>[0]> = {}) =>
  newIdea({ title, ...extra }, { now: at, author: 'human' }).content;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('IdeasScreenController', () => {
  const setup = () => {
    const { map, files } = memoryFiles({
      '.kh/ideas/alpha.md': idea('Alpha', daysAgo(1), { product: 'kaihuman', tags: ['x'] }),
      '.kh/ideas/beta.md': idea('Beta', daysAgo(200), { status: 'parked' }),
      '.kh/ideas/gamma.md': idea('Gamma', daysAgo(20), { status: 'exploring', product: 'palette' }),
      '.kh/ideas/sub/ignored.md': 'x',
    });
    return { map, ctl: new IdeasScreenController({ files, now: () => NOW }) };
  };

  it('lists open ideas by activity with levels and chips', async () => {
    const { ctl } = setup();
    await ctl.load();
    const view = ctl.view();
    expect(view.map((e) => e.slug)).toEqual(['alpha', 'gamma']);
    expect(view.map((e) => e.activity.level)).toEqual(['hot', 'warm']);
    expect(ctl.chips().find((c) => c.status === 'open')?.count).toBe(2);
    expect(ctl.chips().find((c) => c.status === 'parked')?.count).toBe(1);
    expect(ctl.chips().at(-1)).toEqual({ status: 'all', count: 3 });
    expect(ctl.products()).toEqual(['kaihuman', 'palette']);
  });

  it('filters by status, product, search and sorts by title', async () => {
    const { ctl } = setup();
    await ctl.load();
    ctl.setFilters({ status: 'all', sort: 'title' });
    expect(ctl.view().map((e) => e.slug)).toEqual(['alpha', 'beta', 'gamma']);
    ctl.setFilters({ status: 'parked' });
    expect(ctl.view().map((e) => e.slug)).toEqual(['beta']);
    ctl.setFilters({ status: 'all', product: 'palette' });
    expect(ctl.view().map((e) => e.slug)).toEqual(['gamma']);
    ctl.setFilters({ product: null, query: 'alpha' });
    expect(ctl.view().map((e) => e.slug)).toEqual(['alpha']);
  });

  it('builds a 12 week strip, newest week last', () => {
    const parsed = {
      log: [{ at: '2026-11-05 09:00' }, { at: '2026-10-20 09:00' }, { at: '2025-01-01 09:00' }],
    };
    expect(activityStrip(parsed as never, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1]);
  });

  it('logs, challenges and changes status, persisting each edit', async () => {
    const { ctl, map } = setup();
    await ctl.load();
    await ctl.log('alpha' as IdeaSlug, 'Talked to a user');
    expect(map.get('.kh/ideas/alpha.md')).toContain('human · Talked to a user');
    await ctl.challenge('alpha' as IdeaSlug, 'Who pays?');
    expect(ctl.get('alpha' as IdeaSlug)?.idea.challenges.at(-1)).toEqual({
      done: false,
      text: 'Who pays?',
    });
    await ctl.setStatus('alpha' as IdeaSlug, 'committed', 'Go');
    expect(ctl.get('alpha' as IdeaSlug)?.idea.status).toBe('committed');
    await expect(ctl.setStatus('alpha' as IdeaSlug, 'nope')).rejects.toThrow('not an idea status');
    await expect(ctl.setStatus('alpha' as IdeaSlug, 'committed')).rejects.toThrow('already');
  });

  it('creates an idea without overwriting an existing slug', async () => {
    const { ctl, map } = setup();
    await ctl.load();
    const slug = await ctl.create({ title: 'Brand New Thing' });
    expect(slug).toBe('brand-new-thing');
    expect(map.has('.kh/ideas/brand-new-thing.md')).toBe(true);
    expect(ctl.get(slug)?.idea.title).toBe('Brand New Thing');
    await expect(ctl.create({ title: 'Alpha' })).rejects.toThrow('exists');
  });
});

describe('WikiScreenController', () => {
  const pages = {
    '.kh/wiki/home.md':
      '---\ntitle: Home\ntags: [hub]\n---\nSee [[Cats]] and [[cats.md|felines]], `[[Code]]`, [[Missing]].',
    '.kh/wiki/cats.md': '---\ntitle: "Cats"\ntags: [animal, hub]\n---\nBack to [[Home#top]].',
    '.kh/wiki/dogs.md': 'No frontmatter, links [[Cats]].',
    '.kh/other.md': 'not wiki',
  };

  it('loads wiki pages, tags and filters by tag', async () => {
    const ctl = new WikiScreenController({ files: memoryFiles(pages).files });
    await ctl.load();
    expect(ctl.list().map((p) => p.title)).toEqual(['Cats', 'dogs', 'Home']);
    expect(ctl.allTags()).toEqual(['animal', 'hub']);
    ctl.setTag('animal');
    expect(ctl.list().map((p) => p.path)).toEqual(['.kh/wiki/cats.md']);
    ctl.setTag(null);
    expect(ctl.list()).toHaveLength(3);
  });

  it('resolves wikilinks, skips code and flags missing targets', async () => {
    const ctl = new WikiScreenController({ files: memoryFiles(pages).files });
    await ctl.load();
    const links = ctl.render('.kh/wiki/home.md').filter((s) => s.type === 'link');
    expect(links).toEqual([
      { type: 'link', label: 'Cats', target: 'Cats', path: '.kh/wiki/cats.md' },
      { type: 'link', label: 'felines', target: 'cats.md', path: '.kh/wiki/cats.md' },
      { type: 'link', label: 'Missing', target: 'Missing', path: null },
    ]);
    expect(ctl.render('nope')).toEqual([]);
  });

  it('computes backlinks', async () => {
    const ctl = new WikiScreenController({ files: memoryFiles(pages).files });
    await ctl.load();
    expect(ctl.backlinks('.kh/wiki/cats.md').map((p) => p.path)).toEqual([
      '.kh/wiki/dogs.md',
      '.kh/wiki/home.md',
    ]);
    expect(ctl.backlinks('.kh/wiki/home.md').map((p) => p.path)).toEqual(['.kh/wiki/cats.md']);
  });
});

describe('KnowledgeScreenController', () => {
  const setup = () => {
    const { files, map } = memoryFiles({
      '.kh/raw/100-first.md': '---\ntitle: "First one"\n---\nbody',
      '.kh/raw/200-second.md': 'no title',
      '.kh/raw/processed/50-done.md': '---\ntitle: Done\nprocessed: true\n---',
    });
    return { map, ctl: new KnowledgeScreenController({ files, now: () => NOW }) };
  };

  it('lists inbox and processed notes with titles', async () => {
    const { ctl } = setup();
    await ctl.load();
    expect(ctl.inbox().map((i) => [i.name, i.title])).toEqual([
      ['200-second.md', '200-second.md'],
      ['100-first.md', 'First one'],
    ]);
    expect(ctl.processed().map((i) => i.title)).toEqual(['Done']);
  });

  it('adds a raw note in the inbox format', async () => {
    const { ctl, map } = setup();
    await ctl.load();
    const path = await ctl.addNote('  Read this "paper"\nmore  ');
    expect(path).toBe(`.kh/raw/${NOW.getTime()}-read-this-paper.md`);
    expect(map.get(path)).toBe(rawNote('Read this "paper"\nmore', NOW).content);
    expect(map.get(path)).toContain('processed: false');
    expect(ctl.inbox()[0]?.title).toBe('Read this \\"paper\\"');
    await expect(ctl.addNote('   ')).rejects.toThrow('Nothing to capture');
  });
});

describe('FileEditorController', () => {
  const fakeCrypto = {
    encrypt: vi.fn(async (t: string, p: string) => `enc:${p}:${t}`),
    decrypt: vi.fn(async (c: string, p: string) => {
      if (!c.startsWith(`enc:${p}:`)) throw new Error('bad');
      return c.slice(`enc:${p}:`.length);
    }),
  };
  const passwords = (): PasswordPort & { saved: Map<string, string> } => {
    const saved = new Map<string, string>();
    return {
      saved,
      getPassword: (p) => saved.get(p),
      setPassword: (p, pw) => void saved.set(p, pw),
      clearPassword: (p) => void saved.delete(p),
    };
  };
  const setup = () => {
    const { files, map } = memoryFiles({
      'a.md': '# a',
      'notes/b.txt': 'b',
      'notes/deep/c.md': 'c',
      'secret.md.enc': 'enc:pw:top secret',
      'z.csv': 'x,y',
    });
    const pw = passwords();
    return { map, pw, ctl: new FileEditorController({ files, passwords: pw, crypto: fakeCrypto }) };
  };

  it('traverses directories, folders first', () => {
    const { ctl } = setup();
    expect(ctl.list().map((e) => `${e.kind}:${e.name}`)).toEqual([
      'folder:notes',
      'file:a.md',
      'file:secret.md.enc',
      'file:z.csv',
    ]);
    ctl.enter('notes');
    expect(ctl.list().map((e) => e.name)).toEqual(['deep', 'b.txt']);
    ctl.enter('notes/deep');
    expect(ctl.breadcrumbs()).toEqual([
      { name: 'notes', path: 'notes' },
      { name: 'deep', path: 'notes/deep' },
    ]);
    ctl.up();
    expect(ctl.folder).toBe('notes');
    expect(ctl.list('')[2]?.encrypted).toBe(true);
  });

  it('edits and saves a markdown file', async () => {
    const { ctl, map } = setup();
    expect(await ctl.open('a.md')).toMatchObject({
      status: 'open',
      kind: 'markdown',
      dirty: false,
    });
    ctl.edit('# changed');
    expect(ctl.state).toMatchObject({ dirty: true });
    await ctl.save();
    expect(map.get('a.md')).toBe('# changed');
    expect(ctl.state).toMatchObject({ dirty: false });
    expect(
      (await ctl.open('z.csv')).status === 'open' && (ctl.state as { kind: string }).kind,
    ).toBe('text');
  });

  it('keeps an encrypted file locked until the right password, then re-encrypts on save', async () => {
    const { ctl, map, pw } = setup();
    expect((await ctl.open('secret.md.enc')).status).toBe('locked');
    expect(await ctl.unlock('wrong')).toEqual({
      status: 'locked',
      path: 'secret.md.enc',
      error: 'Wrong password or corrupted file.',
    });
    expect(pw.saved.size).toBe(0);
    expect(await ctl.unlock('pw', true)).toMatchObject({
      status: 'open',
      kind: 'markdown',
      encrypted: true,
      content: 'top secret',
    });
    ctl.edit('changed');
    await ctl.save();
    expect(map.get('secret.md.enc')).toBe('enc:pw:changed');
    ctl.lock();
    expect(ctl.state.status).toBe('locked');
    expect(pw.saved.size).toBe(0);
  });

  it('uses a remembered password and drops it when it no longer works', async () => {
    const { ctl, pw } = setup();
    pw.saved.set('secret.md.enc', 'pw');
    expect((await ctl.open('secret.md.enc')).status).toBe('open');
    pw.saved.set('secret.md.enc', 'stale');
    expect((await ctl.open('secret.md.enc')).status).toBe('locked');
    expect(pw.saved.has('secret.md.enc')).toBe(false);
  });

  it('creates, renames and deletes files', async () => {
    const { ctl, map, pw } = setup();
    await ctl.createFile('new.md', 'hi');
    expect(map.get('new.md')).toBe('hi');
    await expect(ctl.createFile('new.md')).rejects.toThrow('exists');
    await expect(ctl.createFile('s.txt.enc', 'x')).rejects.toThrow('password');
    await ctl.createFile('s.txt.enc', 'x', 'k');
    expect(map.get('s.txt.enc')).toBe('enc:k:x');
    expect(pw.saved.get('s.txt.enc')).toBe('k');
    await expect(ctl.renameFile('a.md', 'a.md.enc')).rejects.toThrow('.enc');
    await ctl.renameFile('a.md', 'b.md');
    expect(map.has('b.md')).toBe(true);
    await ctl.open('b.md');
    await ctl.deleteFile('b.md');
    expect(map.has('b.md')).toBe(false);
    expect(ctl.state.status).toBe('closed');
  });
});
