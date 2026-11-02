import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, serializeConfig } from './board-overview-config';

describe('BoardOverview config scope', () => {
  it('round-trips scope', () => {
    expect(parseConfig(serializeConfig({ ...DEFAULT_CONFIG, scope: 'business' })).scope).toBe(
      'business',
    );
  });
  it('defaults to all', () => {
    expect(parseConfig('{}').scope ?? 'all').toBe('all');
  });
});
