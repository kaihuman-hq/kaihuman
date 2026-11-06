import { existsSync, readdirSync } from 'node:fs';
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
});
