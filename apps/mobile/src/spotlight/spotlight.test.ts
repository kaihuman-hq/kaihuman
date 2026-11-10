import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDeepLink } from '../navigation/routes.js';
import { FOCUS_MINUTES } from '../screens/focus-session.js';
import { docsForFile } from '../search/documents.js';
import {
  dayOf,
  MAX_SPOTLIGHT_ITEMS,
  publishSpotlight,
  SPOTLIGHT_ITEMS_FILE,
  type SpotlightSourceDoc,
  spotlightItems,
} from './spotlight.js';
import { startSpotlightSync } from './sync.js';

const todos = docsForFile('.kh/inbox.todos.md', '- [ ] Buy milk #home\n- [x] Call Ana\n');
const note = docsForFile('notes/trip.md', '# Lisbon trip\nPack light');
const idea = docsForFile('.kh/ideas/foo.md', '# Foo');

describe('spotlightItems', () => {
  it('keeps todos and notes from the search index as routed deep links', () => {
    const items = spotlightItems([...todos, ...note, ...idea]);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['todo', 'Buy milk'],
      ['todo', 'Call Ana'],
      ['note', 'Lisbon trip'],
    ]);
    expect(items[0]?.id).toBe('kaihuman://board?item=.kh%2Finbox.todos.md%230');
    expect(items[2]?.id).toBe('kaihuman://files/notes/trip.md');
    for (const item of items) expect(parseDeepLink(item.id), item.id).not.toBeNull();
  });

  it('adds log entries with a unique routed link each, and the day of logs and due todos', () => {
    const log = docsForFile(
      '.kh/inbox.actionlog.md',
      '- 2026-11-03 09:15:00 Booked flights\n- 2026-11-04 18:00:00 Packed\n',
    );
    const due = docsForFile(
      '.kh/inbox.todos.md',
      '- [ ] Book hotel\n  ::updated:: 1 ::due:: 2026-11-12\n',
    );
    const items = spotlightItems([...log, ...due]);
    expect(items.filter((i) => i.kind === 'log').map((i) => [i.title, i.date])).toEqual([
      ['Booked flights', '2026-11-03'],
      ['Packed', '2026-11-04'],
    ]);
    expect(items.find((i) => i.kind === 'todo')).toMatchObject({
      title: 'Book hotel',
      date: '2026-11-12',
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items[0]?.id).toMatch(/^kaihuman:\/\/files\/\.kh\/inbox\.actionlog\.md#\d+$/);
    for (const item of items) expect(parseDeepLink(item.id), item.id).not.toBeNull();
    expect(dayOf('2026-11-03T09:15:00.000Z')).toBe('2026-11-03');
    expect(dayOf('soon')).toBeUndefined();
  });

  it('drops untitled and duplicate docs and caps the list', () => {
    const doc = (id: string, title: string): SpotlightSourceDoc => ({
      id,
      kind: 'note',
      title,
      path: id,
    });
    expect(spotlightItems([doc('a.md', ' '), doc('b.md', 'B'), doc('b.md', 'B again')])).toEqual([
      { id: 'kaihuman://files/b.md', kind: 'note', title: 'B' },
    ]);
    const many = Array.from({ length: MAX_SPOTLIGHT_ITEMS + 5 }, (_, i) => doc(`${i}.md`, `N${i}`));
    expect(spotlightItems(many)).toHaveLength(MAX_SPOTLIGHT_ITEMS);
  });
});

describe('publishSpotlight', () => {
  it('writes the shared file and indexes, skipping unchanged content', () => {
    const native = { writeSharedFile: vi.fn(), indexSpotlight: vi.fn() };
    const first = publishSpotlight(native, note);
    expect(native.writeSharedFile).toHaveBeenCalledWith(SPOTLIGHT_ITEMS_FILE, first);
    expect(native.indexSpotlight).toHaveBeenCalledWith(first);
    publishSpotlight(native, note, first);
    expect(native.writeSharedFile).toHaveBeenCalledTimes(1);
  });

  it('works where the native module has no Spotlight (Android)', () => {
    const native = { writeSharedFile: vi.fn() };
    expect(() => publishSpotlight(native, note)).not.toThrow();
  });
});

describe('startSpotlightSync', () => {
  afterEach(() => vi.useRealTimers());

  it('debounces content changes into one publish and stops cleanly', async () => {
    vi.useFakeTimers();
    let listener: () => void = () => {};
    const off = vi.fn();
    const native = { writeSharedFile: vi.fn() };
    const refresh = vi.fn(async () => note);
    const stop = startSpotlightSync({
      native,
      refresh,
      onChange: (l) => {
        listener = l;
        return off;
      },
      delayMs: 100,
    });
    listener();
    listener();
    await vi.advanceTimersByTimeAsync(150);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(native.writeSharedFile).toHaveBeenCalledTimes(1);
    listener();
    stop();
    await vi.advanceTimersByTimeAsync(150);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalled();
  });

  it('swallows refresh failures', async () => {
    vi.useFakeTimers();
    let listener: () => void = () => {};
    const native = { writeSharedFile: vi.fn() };
    startSpotlightSync({
      native,
      refresh: () => Promise.reject(new Error('boom')),
      onChange: (l) => {
        listener = l;
        return () => undefined;
      },
      delayMs: 10,
    });
    listener();
    await vi.advanceTimersByTimeAsync(20);
    expect(native.writeSharedFile).not.toHaveBeenCalled();
  });
});

it('keeps the native focus default in step with FOCUS_MINUTES', () => {
  const swift = readFileSync(
    new URL('../../targets/ios-widget/FocusIntents.swift', import.meta.url),
    'utf8',
  );
  expect(swift).toContain(`static let defaultMinutes = ${FOCUS_MINUTES}`);
});
