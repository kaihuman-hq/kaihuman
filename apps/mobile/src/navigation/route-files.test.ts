import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuickKind } from './routes.js';

const appDir = fileURLToPath(new URL('../../app/', import.meta.url));

// A Record forces this list to stay in sync with QuickKind at compile time.
const quickKinds: Record<QuickKind, true> = {
  todo: true,
  note: true,
  log: true,
  idea: true,
  knowledge: true,
  inbox: true,
};

describe('expo-router route files', () => {
  it('has a static route file for every quick-capture deep link', () => {
    for (const kind of Object.keys(quickKinds)) {
      expect(existsSync(`${appDir}quick-${kind}.tsx`), `app/quick-${kind}.tsx`).toBe(true);
    }
  });

  it('opens the widget "+" on the same New todo sheet as the in-app add', () => {
    const inbox = readFileSync(`${appDir}quick-inbox.tsx`, 'utf8');
    const todo = readFileSync(`${appDir}quick-todo.tsx`, 'utf8');
    expect(inbox).toContain('<QuickCaptureScreen kind="todo" />');
    expect(todo).toContain('<QuickCaptureScreen kind="todo" />');
  });

  it('presents every quick-capture route as a sheet in the root stack', () => {
    const root = readFileSync(`${appDir}_layout.tsx`, 'utf8');
    for (const kind of Object.keys(quickKinds)) expect(root).toContain(`'quick-${kind}'`);
  });

  it('uses no partial dynamic segments, which expo-router never matches', () => {
    const partial = readdirSync(appDir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      /(^|\/)[^/[]+\[[^\]]+\]/.test(f),
    );
    expect(partial).toEqual([]);
  });

  it('has a route for the OAuth callback so expo-router never shows "Unmatched route"', () => {
    expect(existsSync(`${appDir}auth/callback.tsx`)).toBe(true);
  });

  it('has pushed detail routes for ideas and wiki pages', () => {
    for (const file of ['(tabs)/ideas/[slug].tsx', 'wiki/index.tsx', 'wiki/[...page].tsx']) {
      expect(existsSync(`${appDir}${file}`), `app/${file}`).toBe(true);
    }
    // The old single-file wiki route would shadow wiki/index.
    expect(existsSync(`${appDir}wiki.tsx`)).toBe(false);
  });

  it('registers the detail routes in their stacks', () => {
    const root = readFileSync(`${appDir}_layout.tsx`, 'utf8');
    expect(root).toContain('name="wiki/index"');
    expect(root).toContain('name="wiki/[...page]"');
    expect(readFileSync(`${appDir}(tabs)/ideas/_layout.tsx`, 'utf8')).toContain('name="[slug]"');
  });

  it('has a global search route registered in the root stack', () => {
    expect(existsSync(`${appDir}search.tsx`)).toBe(true);
    expect(readFileSync(`${appDir}_layout.tsx`, 'utf8')).toContain('name="search"');
  });

  it('serves search only from the root stack, with a header button on every tab root', () => {
    // A hidden (tabs)/search would win `/search` and be redirected away (route-resolution.test.ts).
    expect(existsSync(`${appDir}(tabs)/search`)).toBe(false);
    expect(readFileSync(`${appDir}(tabs)/_layout.tsx`, 'utf8')).not.toContain('name="search"');
    for (const tab of ['dashboard', 'board', 'capture', 'ideas', 'more']) {
      expect(readFileSync(`${appDir}(tabs)/${tab}/_layout.tsx`, 'utf8')).toContain('<SearchButton');
    }
  });

  it('has a todo detail route registered in the board stack', () => {
    expect(existsSync(`${appDir}(tabs)/board/todo.tsx`)).toBe(true);
    expect(readFileSync(`${appDir}(tabs)/board/_layout.tsx`, 'utf8')).toContain('name="todo"');
  });

  it('gives every pushed root-stack screen a web back control', () => {
    const root = readFileSync(`${appDir}_layout.tsx`, 'utf8');
    for (const name of [
      'analytics',
      'search',
      'wiki/index',
      'wiki/[...page]',
      'knowledge',
      'repos',
    ]) {
      const screen = new RegExp(`name="${name.replace(/[[\].]/g, '\\$&')}"[\\s\\S]*?/>`).exec(
        root,
      )?.[0];
      expect(screen, name).toContain('webBack(');
    }
    expect(root).toContain("webBack('/files')");
  });
});
