import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Version = { major: number; minor: number; patch: number };
const { compareVersions } = createRequire(import.meta.url)('./check-version-bump.js') as {
  compareVersions: (a: Version, b: Version) => number;
};

const v = (major: number, minor: number, patch: number): Version => ({ major, minor, patch });

describe('compareVersions', () => {
  it('sees a bump at any level', () => {
    expect(compareVersions(v(0, 1, 104), v(0, 1, 103))).toBeGreaterThan(0);
    expect(compareVersions(v(0, 2, 0), v(0, 1, 103))).toBeGreaterThan(0);
    expect(compareVersions(v(1, 0, 0), v(0, 9, 9))).toBeGreaterThan(0);
  });
  it('rejects an unchanged or lower version', () => {
    expect(compareVersions(v(0, 1, 103), v(0, 1, 103))).toBe(0);
    expect(compareVersions(v(0, 1, 102), v(0, 1, 103))).toBeLessThan(0);
    expect(compareVersions(v(0, 1, 200), v(0, 2, 0))).toBeLessThan(0);
  });
});
