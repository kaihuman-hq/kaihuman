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
};

describe('expo-router route files', () => {
  it('has a static route file for every quick-capture deep link', () => {
    for (const kind of Object.keys(quickKinds)) {
      expect(existsSync(`${appDir}quick-${kind}.tsx`), `app/quick-${kind}.tsx`).toBe(true);
    }
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

  it('has a todo detail route registered in the board stack', () => {
    expect(existsSync(`${appDir}(tabs)/board/todo.tsx`)).toBe(true);
    expect(readFileSync(`${appDir}(tabs)/board/_layout.tsx`, 'utf8')).toContain('name="todo"');
  });

  it('gives every pushed root-stack screen a web back control', () => {
    const root = readFileSync(`${appDir}_layout.tsx`, 'utf8');
    for (const name of ['analytics', 'wiki/index', 'wiki/[...page]', 'knowledge', 'repos']) {
      const screen = new RegExp(`name="${name.replace(/[[\].]/g, '\\$&')}"[\\s\\S]*?/>`).exec(
        root,
      )?.[0];
      expect(screen, name).toContain('webBack(');
    }
    expect(root).toContain("webBack('/files')");
  });
});
