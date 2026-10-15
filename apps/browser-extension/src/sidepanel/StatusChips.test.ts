import { describe, expect, it } from 'vitest';
import type { WorkItemStatus } from '../background/work/types';
import { toneOf } from './StatusChips';

const status = (patch: Partial<WorkItemStatus> = {}): WorkItemStatus => ({
  key: 'acme/web#1' as never,
  url: 'https://github.com/acme/web/pull/1',
  repo: 'acme/web',
  number: 1,
  kind: 'pr',
  title: 'PR',
  state: 'open',
  isDraft: false,
  review: null,
  ci: null,
  conflict: false,
  updatedAt: '2026-10-14T09:00:00.000Z',
  ...patch,
});

describe('toneOf', () => {
  it('ranks the most urgent signal first', () => {
    expect(toneOf(status({ review: 'approved', ci: 'failure' }), false)).toBe('bad');
    expect(toneOf(status({ review: 'approved', ci: 'pending' }), false)).toBe('warn');
    expect(toneOf(status({ review: 'approved', ci: 'success' }), true)).toBe('good');
    expect(toneOf(status(), true)).toBe('new');
    expect(toneOf(status(), false)).toBe('plain');
    expect(toneOf(status({ conflict: true }), false)).toBe('bad');
  });

  it('counts extra signals such as inbox reasons', () => {
    expect(toneOf(status(), false, ['warn'])).toBe('warn');
    expect(toneOf(undefined, false, ['plain', 'bad'])).toBe('bad');
  });

  it('calms merged and closed items, and flags missing ones', () => {
    expect(toneOf(status({ state: 'merged', ci: 'failure' }), true)).toBe('plain');
    expect(toneOf({ key: 'acme/web#1' as never, error: 'not-found', org: 'acme' }, false)).toBe(
      'bad',
    );
  });
});
