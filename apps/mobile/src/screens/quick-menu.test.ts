import { configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Glance, QuickAction } from '../views/tiles/glance/types.js';
import type { TileFile } from './dashboards.js';
import { loadedTiles, setLoadedTiles, tileWrite, updateLoadedTile } from './loaded-tiles.js';
import {
  asResult,
  CAPTURE_ACTIONS,
  emptyUsage,
  lastAction,
  loadUsage,
  parseUsage,
  performQuickAction,
  quickEntryHref,
  recordUse,
  saveUsage,
  trackActions,
  usageCaption,
  usesToday,
} from './quick-menu.js';

const NOW = new Date(2026, 10, 10, 9, 0, 0);
const TOMORROW = new Date(2026, 10, 11, 9, 0, 0);

const glance = (action?: QuickAction): Glance => ({
  title: 'X',
  icon: 'gauge',
  tint: 'orange',
  hero: '1',
  label: 'x',
  ...(action && { action }),
});
const tap: QuickAction = { kind: 'tap', icon: 'add', label: 'Coffee +1', run: (c) => `${c}+` };
const field: QuickAction = {
  kind: 'field',
  icon: 'add',
  label: 'Expense',
  placeholder: 'Amount',
  submit: (c, v) => ({ ok: true, content: `${c}${v}` }),
};
const open: QuickAction = { kind: 'open', icon: 'add', label: 'Event', href: '/x' };

const byPath: Record<string, Glance | null> = {
  'a.consumption.csv': glance(tap),
  'b.budget.csv': glance(field),
  'c.events.csv': glance(open),
  'd.timezones.json': glance(),
  'e.unknown': null,
};
const files: TileFile[] = Object.keys(byPath).map((path) => ({ path, content: 'body' }));
const glanceFor = (f: TileFile) => byPath[f.path] ?? null;

describe('trackActions', () => {
  it('lists one entry per tile with a tap or field action, in tile order', () => {
    const actions = trackActions(files, glanceFor);
    expect(actions).toEqual([
      {
        kind: 'tap',
        id: 'tap:a.consumption.csv',
        path: 'a.consumption.csv',
        label: 'Coffee +1',
        icon: 'gauge',
        tint: 'orange',
      },
      {
        kind: 'field',
        id: 'field:b.budget.csv',
        path: 'b.budget.csv',
        href: '/quick-entry?path=b.budget.csv',
        label: 'Expense',
        icon: 'gauge',
        tint: 'orange',
      },
    ]);
  });

  it('skips duplicate paths and files without content', () => {
    const dup = [...files, { path: 'a.consumption.csv', content: 'body' }];
    expect(trackActions(dup, glanceFor)).toHaveLength(2);
    expect(trackActions([{ path: 'a.consumption.csv', content: '' }], glanceFor)).toEqual([]);
  });

  it('encodes the path into the quick-entry href', () => {
    expect(quickEntryHref('.kh/my file.budget.csv')).toBe(
      '/quick-entry?path=.kh%2Fmy%20file.budget.csv',
    );
  });
});

describe('capture actions', () => {
  it('opens the five existing quick sheets', () => {
    expect(CAPTURE_ACTIONS.map((a) => a.kind === 'capture' && a.href)).toEqual([
      '/quick-todo',
      '/quick-note',
      '/quick-log',
      '/quick-idea',
      '/quick-knowledge',
    ]);
  });
});

describe('usage', () => {
  it('counts uses per day and remembers the last action', () => {
    let u = emptyUsage(NOW);
    u = recordUse(u, 'tap:a', NOW);
    u = recordUse(u, 'tap:a', NOW);
    u = recordUse(u, 'capture:todo', NOW);
    expect(u.last).toBe('capture:todo');
    expect(usesToday(u, 'tap:a', NOW)).toBe(2);
    expect(usesToday(u, 'tap:a', TOMORROW)).toBe(0);
    expect(recordUse(u, 'tap:a', TOMORROW).counts).toEqual({ 'tap:a': 1 });
  });

  it('resolves the last action only while it still exists', () => {
    const u = recordUse(emptyUsage(NOW), 'capture:note', NOW);
    expect(lastAction(u, CAPTURE_ACTIONS)?.label).toBe('Note');
    expect(lastAction(recordUse(u, 'tap:gone', NOW), CAPTURE_ACTIONS)).toBeNull();
  });

  it('captions the count', () => {
    expect(usageCaption(0)).toBe('');
    expect(usageCaption(4)).toBe('used 4× today');
  });

  it('parses stored usage defensively', () => {
    expect(parseUsage(null, NOW)).toEqual(emptyUsage(NOW));
    expect(parseUsage('{bad', NOW)).toEqual(emptyUsage(NOW));
    expect(parseUsage('{"day":1}', NOW)).toEqual(emptyUsage(NOW));
    expect(parseUsage('{"last":"x","day":"2026-11-10","counts":{"x":2,"y":"no"}}', NOW)).toEqual({
      last: 'x',
      day: '2026-11-10',
      counts: { x: 2 },
    });
  });

  describe('storage', () => {
    beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));
    it('round-trips through core storage', () => {
      const u = recordUse(emptyUsage(NOW), 'tap:a', NOW);
      saveUsage(u);
      expect(loadUsage(NOW)).toEqual(u);
    });
  });

  it('wraps plain text results', () => {
    expect(asResult('x')).toEqual({ ok: true, content: 'x' });
    expect(asResult({ ok: false, error: 'e' })).toEqual({ ok: false, error: 'e' });
  });
});

describe('loaded tiles', () => {
  it('keeps one copy per path and patches written files', () => {
    setLoadedTiles([
      { path: 'a', content: '1' },
      { path: 'a', content: '2' },
      { path: 'b', content: '3' },
    ]);
    expect(loadedTiles.value).toEqual([
      { path: 'a', content: '1' },
      { path: 'b', content: '3' },
    ]);
    updateLoadedTile('b', '4');
    expect(loadedTiles.value[1]).toEqual({ path: 'b', content: '4' });
    expect(tileWrite.value).toEqual({ path: 'b', content: '4' });
  });
});

describe('performQuickAction', () => {
  const deps = (content: string) => {
    const writes: [string, string][] = [];
    const navigated: string[] = [];
    return {
      writes,
      navigated,
      deps: {
        navigate: (h: string) => navigated.push(h),
        files: {
          read: async () => content,
          write: async (p: string, c: string) => {
            writes.push([p, c]);
          },
        },
        glanceFor,
        now: NOW,
      },
    };
  };
  const [tapAction, fieldAction] = trackActions(files, glanceFor);

  it('navigates for capture and field entries', async () => {
    const d = deps('x');
    expect(await performQuickAction(CAPTURE_ACTIONS[0] as never, d.deps)).toEqual({
      kind: 'navigated',
    });
    await performQuickAction(fieldAction as never, d.deps);
    expect(d.navigated).toEqual(['/quick-todo', '/quick-entry?path=b.budget.csv']);
    expect(d.writes).toEqual([]);
  });

  it('applies a tap action to the current file text and writes it', async () => {
    const d = deps('fresh');
    expect(await performQuickAction(tapAction as never, d.deps)).toEqual({
      kind: 'written',
      path: 'a.consumption.csv',
      content: 'fresh+',
    });
    expect(d.writes).toEqual([['a.consumption.csv', 'fresh+']]);
  });

  it('reports rejected results and read errors without writing', async () => {
    const d = deps('x');
    const rejecting = {
      ...d.deps,
      glanceFor: () =>
        glance({ kind: 'tap', icon: 'add', label: 'L', run: () => ({ ok: false, error: 'nope' }) }),
    };
    expect(await performQuickAction(tapAction as never, rejecting)).toEqual({
      kind: 'failed',
      error: 'nope',
    });
    const broken = {
      ...d.deps,
      files: { ...d.deps.files, read: async () => Promise.reject(new Error('offline')) },
    };
    expect(await performQuickAction(tapAction as never, broken)).toEqual({
      kind: 'failed',
      error: 'offline',
    });
    expect(d.writes).toEqual([]);
  });
});
