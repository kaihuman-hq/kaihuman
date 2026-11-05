import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, serializeConfig } from './board-overview-config';

describe('BoardOverview config scope', () => {
  it('round-trips scope', () => {
    expect(parseConfig(serializeConfig({ ...DEFAULT_CONFIG, scope: 'business' })).scope).toBe(
      'business',
    );
  });
  it('defaults to all', () => {
    expect(parseConfig('{}').scope).toBe('all');
  });
  it('keeps other fields of an old config without scope', () => {
    const cfg = parseConfig('{"showDone":true,"overdueDays":3}');
    expect(cfg).toMatchObject({ showDone: true, overdueDays: 3, scope: 'all' });
  });
  it('falls back to all for an invalid scope', () => {
    expect(parseConfig('{"scope":"work"}').scope).toBe('all');
  });
});
