import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOARD_OVERVIEW_CONFIG,
  parseBoardOverviewConfig,
  serializeBoardOverviewConfig,
} from './board-overview.js';

describe('board overview config', () => {
  it('round-trips scope and defaults to all', () => {
    const cfg = { ...DEFAULT_BOARD_OVERVIEW_CONFIG, scope: 'business' as const };
    expect(parseBoardOverviewConfig(serializeBoardOverviewConfig(cfg)).scope).toBe('business');
    expect(parseBoardOverviewConfig('{}').scope).toBe('all');
    expect(parseBoardOverviewConfig('{"scope":"work"}').scope).toBe('all');
  });
  it('keeps old fields and survives invalid JSON', () => {
    expect(parseBoardOverviewConfig('{"showDone":true,"overdueDays":3}')).toMatchObject({
      showDone: true,
      overdueDays: 3,
    });
    expect(parseBoardOverviewConfig('{x')).toEqual(DEFAULT_BOARD_OVERVIEW_CONFIG);
  });
});
