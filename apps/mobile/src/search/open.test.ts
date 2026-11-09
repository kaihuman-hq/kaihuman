import { describe, expect, it, vi } from 'vitest';
import { docsForFile, type SearchKind } from './documents.js';
import { openTarget } from './open.js';

const deps = () => ({ push: vi.fn(), openUrl: vi.fn() });

describe('openTarget', () => {
  it('pushes the href of a route target', () => {
    const d = deps();
    openTarget({ type: 'route', href: '/ideas/x' }, d);
    expect(d.push).toHaveBeenCalledWith('/ideas/x');
    expect(d.openUrl).not.toHaveBeenCalled();
  });

  it('opens a url target in the browser', () => {
    const d = deps();
    openTarget({ type: 'url', url: 'https://a.dev' }, d);
    expect(d.openUrl).toHaveBeenCalledWith('https://a.dev');
    expect(d.push).not.toHaveBeenCalled();
  });

  const cases: [SearchKind, string, string, 'push' | 'openUrl', string][] = [
    ['todo', 'a.todos.md', '- [ ] one\n', 'push', '/board/todo?id=a.todos.md%230'],
    ['idea', '.kh/ideas/my-idea.md', '# t\n', 'push', '/ideas/my-idea'],
    ['wiki', '.kh/wiki/p.md', 'x', 'push', '/wiki/p'],
    ['knowledge', '.kh/raw/p.md', 'x', 'push', '/files/.kh/raw/p.md'],
    ['note', 'n.md', 'x', 'push', '/files/n.md'],
    [
      'bookmark',
      'b.bookmarks.json',
      '[{"title":"t","url":"https://a.dev"}]',
      'openUrl',
      'https://a.dev',
    ],
    ['file', 'z.txt', 'x', 'push', '/files/z.txt'],
  ];
  it.each(cases)('routes a %s result', (kind, path, content, via, arg) => {
    const d = deps();
    const doc = docsForFile(path, content).find((x) => x.kind === kind);
    expect(doc).toBeDefined();
    if (doc) openTarget(doc.target, d);
    expect(d[via]).toHaveBeenCalledWith(arg);
  });
});
