import { describe, expect, it } from 'vitest';
import { docsForFile, MAX_TEXT } from './documents.js';

const of = (path: string, content: string | null, kind: string) =>
  docsForFile(path, content).filter((d) => d.kind === kind);

describe('docsForFile', () => {
  it('always yields a file doc named by basename, with an encoded route', () => {
    const [file] = of('My Notes/a b.txt', 'hello', 'file');
    expect(file).toMatchObject({
      kind: 'file',
      title: 'a b.txt',
      subtitle: 'My Notes',
      path: 'My Notes/a b.txt',
      target: { type: 'route', href: '/files/My%20Notes/a%20b.txt' },
    });
    expect(file?.text).toBe('hello');
  });

  it('yields name-only docs when the content is not cached', () => {
    const docs = docsForFile('x/y.md', null);
    expect(docs.map((d) => d.kind).sort()).toEqual(['file', 'note']);
    expect(docs.every((d) => d.text === undefined)).toBe(true);
  });

  it('does not index encrypted or binary content', () => {
    expect(docsForFile('secret.md.enc', 'abc')[0]?.text).toBeUndefined();
    expect(docsForFile('img.bin', 'a\u0000b')[0]?.text).toBeUndefined();
  });

  it('caps the text of a huge file', () => {
    const [file] = of('big.txt', 'x'.repeat(MAX_TEXT * 2), 'file');
    expect(file?.text?.length).toBe(MAX_TEXT);
  });

  it('makes one todo doc per item with the detail route, tags and milestone name', () => {
    const md = ['- [ ] first thing #ops', '- [>] second thing', ''].join('\n');
    const todos = of('.kh/inbox.todos.md', md, 'todo');
    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({
      title: 'first thing',
      path: '.kh/inbox.todos.md',
      target: { type: 'route', href: '/board/todo?id=.kh%2Finbox.todos.md%230' },
    });
    expect(todos[0]?.keywords).toContain('ops');
    expect(todos[1]?.target).toEqual({
      type: 'route',
      href: '/board/todo?id=.kh%2Finbox.todos.md%231',
    });
    expect(todos[1]?.subtitle).toContain('inbox.todos.md');
  });

  it('puts the milestone name, not its id, into the todo keywords', () => {
    const md = '---\nmilestones:\n  - id: beta\n    name: Beta launch\n---\n- [ ] ship it !beta\n';
    const [todo] = of('a.todos.md', md, 'todo');
    expect(todo?.keywords).toContain('Beta launch');
    expect(todo?.subtitle).toContain('Beta launch');
  });

  it('makes an idea doc routed by slug', () => {
    const md =
      '---\ntitle: Offline search\nstatus: exploring\nproduct: mobile\n---\n\nsummary words\n';
    const [idea] = of('.kh/ideas/offline-search.md', md, 'idea');
    expect(idea).toMatchObject({
      title: 'Offline search',
      target: { type: 'route', href: '/ideas/offline-search' },
    });
    expect(idea?.subtitle).toBe('exploring · mobile');
    expect(idea?.text).toContain('summary words');
    expect(of('.kh/ideas/sub/dir/x.md', md, 'idea')).toHaveLength(0);
  });

  it('makes a wiki doc titled from frontmatter, else the basename', () => {
    const [titled] = of('.kh/wiki/a/b.md', '---\ntitle: Big Page\ntags: [x, y]\n---\nbody', 'wiki');
    expect(titled).toMatchObject({
      title: 'Big Page',
      target: { type: 'route', href: '/wiki/a/b' },
    });
    expect(titled?.keywords).toContain('x');
    const [plain] = of('.kh/wiki/Some Page.md', 'body', 'wiki');
    expect(plain?.title).toBe('Some Page');
    expect(plain?.target).toEqual({ type: 'route', href: '/wiki/Some%20Page' });
  });

  it('makes a knowledge doc from raw sources, linked to the file route', () => {
    const [fm] = of('.kh/raw/x.md', '---\ntitle: Paper\n---\nbody', 'knowledge');
    expect(fm).toMatchObject({
      title: 'Paper',
      target: { type: 'route', href: '/files/.kh/raw/x.md' },
    });
    const [first] = of('.kh/raw/y.md', '\nfirst line\nsecond', 'knowledge');
    expect(first?.title).toBe('first line');
  });

  it('makes one bookmark doc per bookmark, opening the url', () => {
    const list = [
      { id: '1', title: 'Docs', url: 'https://a.dev/x', tags: ['ref'] },
      { id: '2', title: '', url: 'https://b.dev' },
      { id: '3', title: 'bad', url: 'javascript:alert(1)' },
    ];
    for (const json of [JSON.stringify(list), JSON.stringify({ bookmarks: list })]) {
      const docs = of('.kh/browser.bookmarks.json', json, 'bookmark');
      expect(docs.map((d) => d.title)).toEqual(['Docs', 'https://b.dev']);
      expect(docs[0]).toMatchObject({
        subtitle: 'https://a.dev/x',
        target: { type: 'url', url: 'https://a.dev/x' },
      });
      expect(docs[0]?.keywords).toContain('ref');
    }
  });

  it('survives malformed bookmark files', () => {
    for (const bad of ['{nope', '42', 'null', '{"bookmarks": 3}', '[1, null, "x"]']) {
      expect(of('b.bookmarks.json', bad, 'bookmark')).toEqual([]);
    }
    expect(of('b.bookmarks.json', null, 'bookmark')).toEqual([]);
  });

  it('makes one log doc per action-log entry', () => {
    const md = [
      '---',
      'type: actionlog',
      '---',
      '',
      '- 2026-01-02 10:00:00 fixed the build #ci',
      '- 2026-01-01 09:00:00 wrote docs',
      '',
    ].join('\n');
    const logs = of('.kh/x.actionlog.md', md, 'log');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.title).toContain('fixed the build');
    expect(logs[0]?.target).toEqual({ type: 'route', href: '/files/.kh/x.actionlog.md' });
  });

  it('makes a note doc from other markdown, titled by its first heading or line', () => {
    const [heading] = of('docs/n.md', '\n# Plans\n\nmore', 'note');
    expect(heading).toMatchObject({
      title: 'Plans',
      target: { type: 'route', href: '/files/docs/n.md' },
    });
    expect(of('n2.md', 'just a line\nz', 'note')[0]?.title).toBe('just a line');
    expect(of('empty.md', '', 'note')[0]?.title).toBe('empty.md');
  });

  it('does not make notes of the specialised markdown kinds', () => {
    for (const p of ['a.todos.md', 'a.actionlog.md', '.kh/wiki/p.md', '.kh/raw/p.md']) {
      expect(of(p, 'x', 'note')).toEqual([]);
    }
  });
});
