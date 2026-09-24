import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.js';
import { KbError, KnowledgeBase } from './repo.js';
import { makeRepo, SAMPLE_KB } from './test/fixture.js';

async function listTree(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

describe('KnowledgeBase.open', () => {
  it('prefers .kh over legacy .lifeos', async () => {
    const root = await makeRepo({ '.kh/log.md': '', '.lifeos/log.md': '' });
    expect((await KnowledgeBase.open(root)).kbDirName).toBe('.kh');
  });

  it('falls back to .lifeos when .kh is missing', async () => {
    const root = await makeRepo({ '.lifeos/wiki/a.md': '---\ntitle: A\n---\n' });
    const kb = await KnowledgeBase.open(root);
    expect(kb.kbDirName).toBe('.lifeos');
    expect((await kb.listPages()).map((p) => p.title)).toEqual(['A']);
  });

  it('defaults to .kh when neither exists, and fails on a missing repo', async () => {
    const root = await makeRepo({});
    const kb = await KnowledgeBase.open(root);
    expect(kb.kbDirName).toBe('.kh');
    expect(await kb.listPages()).toEqual([]);
    await expect(KnowledgeBase.open(join(root, 'missing'))).rejects.toThrow(KbError);
  });
});

describe('KnowledgeBase pages', () => {
  it('lists pages with parsed metadata', async () => {
    const kb = await KnowledgeBase.open(await makeRepo(SAMPLE_KB));
    const pages = await kb.listPages();
    expect(pages.map((p) => p.file)).toEqual(['react-hooks.md', 'state.md', 'vite.md']);
    expect(pages[0]).toMatchObject({
      title: 'React Hooks',
      type: 'concept',
      tags: ['react', 'frontend'],
      sources: ['raw/processed/1-hooks.md'],
      updated: '2026-04-05',
      links: ['Vite'],
    });
  });

  it.each([
    'react-hooks.md',
    'react-hooks',
    'React Hooks',
    'REACT HOOKS',
  ])('reads a page by %j with backlinks', async (ref) => {
    const kb = await KnowledgeBase.open(await makeRepo(SAMPLE_KB));
    const { page, backlinks } = await kb.readPage(ref);
    expect(page.file).toBe('react-hooks.md');
    expect(page.content).toBe(SAMPLE_KB['.kh/wiki/react-hooks.md']);
    expect(backlinks).toEqual([
      { file: 'state.md', title: 'State Management' },
      { file: 'vite.md', title: 'Vite' },
    ]);
  });

  it('reports unknown pages', async () => {
    const kb = await KnowledgeBase.open(await makeRepo(SAMPLE_KB));
    await expect(kb.readPage('nope')).rejects.toThrow(/No wiki page matches "nope"/);
    await expect(kb.readPage('  ')).rejects.toThrow(KbError);
  });

  it('refuses path traversal outside the wiki directory', async () => {
    const root = await makeRepo({ ...SAMPLE_KB, 'secret.md': 'top secret' });
    const kb = await KnowledgeBase.open(root);
    await expect(kb.readPage('../../secret.md')).rejects.toThrow(/outside the wiki directory/);
    await expect(kb.readPage('../index.kb')).rejects.toThrow(/outside the wiki directory/);
    await expect(kb.readPage(join(root, 'secret.md'))).rejects.toThrow(/outside the wiki/);
  });

  it('refuses symlinks that escape the wiki directory', async () => {
    const root = await makeRepo({ ...SAMPLE_KB, 'secret.md': 'top secret' });
    await symlink(join(root, 'secret.md'), join(root, '.kh/wiki/leak.md'));
    const kb = await KnowledgeBase.open(root);
    await expect(kb.readPage('leak')).rejects.toThrow(/outside the wiki directory/);
  });
});

describe('KnowledgeBase index, log and search index', () => {
  it('reads index and parses the log newest first', async () => {
    const kb = await KnowledgeBase.open(await makeRepo(SAMPLE_KB));
    expect(await kb.readIndex()).toContain('[[React Hooks]]');
    expect((await kb.readLog()).map((e) => e.title)).toEqual(['Vite docs', 'Hooks article']);
  });

  it('explains missing files', async () => {
    const kb = await KnowledgeBase.open(await makeRepo({ '.kh/wiki/a.md': '' }));
    await expect(kb.readIndex()).rejects.toThrow('.kh/index.kb.md does not exist');
    await expect(kb.readLog()).rejects.toThrow('.kh/log.md does not exist');
  });

  it('loads search.kb.json and ignores a missing or malformed one', async () => {
    const root = await makeRepo(SAMPLE_KB);
    const kb = await KnowledgeBase.open(root);
    expect(await kb.readSearchIndex()).toBeUndefined();
    await writeFile(join(root, '.kh/search.kb.json'), '{not json');
    expect(await kb.readSearchIndex()).toBeUndefined();
    await writeFile(join(root, '.kh/search.kb.json'), '{"version":"1","index":{"x":["a.md"]}}');
    expect(await kb.readSearchIndex()).toEqual({ version: '1', index: { x: ['a.md'] } });
  });
});

describe('KnowledgeBase.addRaw', () => {
  it('writes only a new raw note with processed: false frontmatter', async () => {
    const root = await makeRepo(SAMPLE_KB);
    const before = await listTree(root);
    const kb = await KnowledgeBase.open(root);

    const path = await kb.addRaw({
      title: 'A "quoted"\nTitle: with stuff',
      text: 'Body text',
      url: 'https://example.com/a',
      tags: ['ai', 'llm'],
    });

    expect(path).toMatch(/^\.kh\/raw\/\d{13}-a-quoted-title-with-stuff\.md$/);
    expect(await listTree(root)).toEqual([...before, path].sort());
    const { data, body } = parseFrontmatter(await readFile(join(root, path), 'utf8'));
    expect(data).toEqual({
      title: 'A "quoted" Title: with stuff',
      url: 'https://example.com/a',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      processed: false,
      tags: ['ai', 'llm'],
    });
    expect(body).toBe('\nBody text\n');
  });

  it('creates raw/ when missing and defaults slug and tags', async () => {
    const root = await makeRepo({});
    await mkdir(join(root, '.lifeos'));
    const kb = await KnowledgeBase.open(root);
    const path = await kb.addRaw({ title: '???', text: 'x' });
    expect(path).toMatch(/^\.lifeos\/raw\/\d+-note\.md$/);
    const { data } = parseFrontmatter(await readFile(join(root, path), 'utf8'));
    expect(data.tags).toEqual(['general']);
    expect(data.url).toBe('');
  });
});
