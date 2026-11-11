import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getLinkingConfig } from 'expo-router/build/getLinkingConfig.js';
import { getRoutes } from 'expo-router/build/getRoutes.js';
import { describe, expect, it } from 'vitest';
import { docsForFile } from '../search/documents.js';

const appDir = fileURLToPath(new URL('../../app/', import.meta.url));

// The real route tree, built by expo-router itself from the files under app/ (modules stubbed).
const files = readdirSync(appDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `./${f}`);
const context = Object.assign(() => ({ default: () => null }), {
  keys: () => files,
  resolve: (key: string) => key,
  id: 'app',
});
type Context = Parameters<typeof getRoutes>[0];
const routes = getRoutes(context as unknown as Context, {
  platform: 'ios',
  ignoreEntryPoints: true,
});
if (!routes) throw new Error('no routes');
const linking = getLinkingConfig(routes, context as unknown as Context, {
  skipGenerated: true,
  sitemap: false,
  notFound: false,
});

interface StateRoute {
  name: string;
  state?: { routes: StateRoute[] };
}

/** Route names from the root down to the screen expo-router focuses for `href`. */
const resolve = (href: string): string[] => {
  const state = linking.getStateFromPath?.(href, linking.config) as
    | { routes: StateRoute[] }
    | undefined;
  const names: string[] = [];
  let route = state?.routes.at(-1);
  while (route) {
    names.push(route.name);
    route = route.state?.routes.at(-1);
  }
  return names.filter((n) => n !== '__root');
};

describe('expo-router href resolution', () => {
  // A hidden tab (`href: null`) is redirected to the first visible tab as soon as it is focused,
  // so a `/search` that resolved into (tabs) bounced straight back to Today.
  it('opens /search on the root-stack search screen, not a hidden tab', () => {
    expect(resolve('/search')).toEqual(['search']);
    expect(resolve('/search?q=release')).toEqual(['search']);
  });

  it('resolves every search result kind to a screen', () => {
    const docs = [
      ...docsForFile('a.todos.md', '- [ ] one\n'),
      ...docsForFile('.kh/ideas/my-idea.md', '# t\n'),
      ...docsForFile('.kh/wiki/p.md', 'x'),
      ...docsForFile('.kh/raw/p.md', 'x'),
      ...docsForFile('notes/My Note.md', 'x'),
    ];
    const hrefs = docs.flatMap((d) => (d.target.type === 'route' ? [d.target.href] : []));
    expect(hrefs.map(resolve)).toEqual([
      ['(tabs)', 'board', 'todo'],
      ['files/[...path]'],
      ['(tabs)', 'ideas', '[slug]'],
      ['files/[...path]'],
      ['wiki/[...page]'],
      ['files/[...path]'],
      ['files/[...path]'],
      ['files/[...path]'],
      ['files/[...path]'],
      ['files/[...path]'],
    ]);
  });
});
