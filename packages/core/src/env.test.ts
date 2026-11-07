import { describe, expect, it } from 'vitest';
import { viteEnv } from './env.js';

describe('viteEnv', () => {
  it('returns an empty env when the bundler does not inject import.meta.env', () => {
    expect(viteEnv({}).PROD).toBeUndefined();
  });

  it('passes through an injected env', () => {
    expect(viteEnv({ env: { PROD: true } }).PROD).toBe(true);
  });
});
