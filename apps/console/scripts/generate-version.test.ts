import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { shouldGenerate } = createRequire(import.meta.url)('./generate-version.js') as {
  shouldGenerate: (env: Record<string, string | undefined>, argv: string[]) => boolean;
};

describe('shouldGenerate', () => {
  it('skips locally', () => {
    expect(shouldGenerate({}, [])).toBe(false);
    expect(shouldGenerate({ CI: '', GITHUB_ACTIONS: 'false', GENERATE_VERSION: '0' }, [])).toBe(
      false,
    );
  });
  it('runs in CI', () => {
    expect(shouldGenerate({ CI: 'true' }, [])).toBe(true);
    expect(shouldGenerate({ GITHUB_ACTIONS: 'true' }, [])).toBe(true);
  });
  it('runs when forced', () => {
    expect(shouldGenerate({}, ['--force'])).toBe(true);
    expect(shouldGenerate({ GENERATE_VERSION: '1' }, [])).toBe(true);
  });
});
