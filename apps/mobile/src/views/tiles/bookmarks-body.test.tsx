import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { openBrowserAsync } from 'expo-web-browser';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookmarksView, parseBookmarksFile } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Bookmarks } from './bookmarks-body.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const NOW = new Date('2026-11-09T12:00:00.000Z');
const entry = (id: string, title: string, tags: string[], extra: object = {}) => ({
  id,
  title,
  url: `https://${id}.test/`,
  tags,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  useCount: 0,
  lastUsedAt: '',
  pinned: false,
  ...extra,
});
const content = JSON.stringify({
  updatedAt: '',
  bookmarks: [
    entry('a', 'Alpha', ['dev'], { useCount: 1 }),
    entry('b', 'Beta', ['news'], { useCount: 9 }),
    entry('c', 'Gamma', ['dev']),
  ],
});

const setup = () => {
  const apply = vi.fn<Ctx['apply']>(() => true);
  render(
    <Bookmarks
      initial={bookmarksView(content, {}, NOW)}
      ctx={{ content, now: NOW, apply, error: null }}
    />,
  );
  return apply;
};
const written = (apply: ReturnType<typeof setup>, call = 0) => {
  const r = apply.mock.calls[call]?.[0];
  return parseBookmarksFile(typeof r === 'string' ? r : r?.ok ? r.content : '').bookmarks;
};
const titles = () => screen.getAllByTestId(/^bookmark-/).map((el) => el.getAttribute('aria-label'));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const longPress = (id: string) => {
  const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
  vi.useFakeTimers();
  fireEvent.mouseDown(screen.getByTestId(`bookmark-${id}`), {
    button: 0,
    buttons: 1,
    clientX: 5,
    clientY: 5,
  });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
  return alert.mock.calls.at(-1)?.[2] as AlertButton[];
};

describe('Bookmarks body', () => {
  it('tag chips filter the list', () => {
    setup();
    press('Tag dev');
    expect(titles()).toEqual(['Alpha', 'Gamma']);
    press('Tag dev');
    expect(titles()).toHaveLength(3);
    press('Tag news');
    press('All');
    expect(titles()).toHaveLength(3);
  });

  it('sort chips reorder', () => {
    setup();
    press('Sort Most used');
    expect(titles()[0]).toBe('Beta');
    press('Sort Least used');
    expect(titles()[0]).toBe('Gamma');
    press('Sort Newest');
    expect(titles()[0]).toBe('Alpha');
    press('Sort Frecency');
    expect(titles()).toHaveLength(3);
  });

  it('tapping opens the link and counts the use', () => {
    const apply = setup();
    fireEvent.click(screen.getByTestId('bookmark-b'));
    expect(openBrowserAsync).toHaveBeenCalledWith('https://b.test/');
    expect(written(apply).find((b) => b.id === 'b')?.useCount).toBe(10);
  });

  it('long press pins; pinned bookmarks lead and offer Unpin', () => {
    const apply = setup();
    longPress('c')
      .find((b) => b.text === 'Pin')
      ?.onPress?.();
    expect(written(apply).find((b) => b.id === 'c')?.pinned).toBe(true);
  });

  it('pinned bookmark floats to the top', () => {
    const pinned = JSON.stringify({
      bookmarks: [entry('a', 'Alpha', []), entry('b', 'Beta', [], { pinned: true })],
    });
    render(
      <Bookmarks
        initial={bookmarksView(pinned, {}, NOW)}
        ctx={{ content: pinned, now: NOW, apply: vi.fn(() => true), error: null }}
      />,
    );
    expect(titles()).toEqual(['Beta', 'Alpha']);
    expect(longPress('b').some((b) => b.text === 'Unpin')).toBe(true);
  });

  it('long press edits title and url', () => {
    const apply = setup();
    const edit = longPress('a').find((b) => b.text === 'Edit');
    act(() => edit?.onPress?.());
    fireEvent.change(screen.getByLabelText('Bookmark URL'), {
      target: { value: 'https://new.test/' },
    });
    type('Title (optional)', 'Renamed');
    type('Tags (optional)', 'x, y');
    press('Save changes');
    expect(written(apply).find((b) => b.id === 'a')).toMatchObject({
      title: 'Renamed',
      url: 'https://new.test/',
      tags: ['x', 'y'],
    });
  });

  it('long press deletes', () => {
    const apply = setup();
    longPress('a')
      .find((b) => b.text === 'Delete bookmark')
      ?.onPress?.();
    expect(written(apply).map((b) => b.id)).toEqual(['b', 'c']);
  });

  it('add form takes optional title and tags', () => {
    const apply = setup();
    expect(screen.queryByLabelText('Bookmark URL')).toBeNull();
    press('Add bookmark');
    type('Bookmark URL', 'https://new.test/');
    type('Title (optional)', 'Fresh');
    type('Tags (optional)', '#one, two');
    press('Save bookmark');
    expect(written(apply)[0]).toMatchObject({
      url: 'https://new.test/',
      title: 'Fresh',
      tags: ['one', 'two'],
    });
  });

  it('keeps the add form open when the url is rejected', () => {
    const apply = vi.fn<Ctx['apply']>(() => false);
    render(
      <Bookmarks
        initial={bookmarksView(content, {}, NOW)}
        ctx={{ content, now: NOW, apply, error: null }}
      />,
    );
    press('Add bookmark');
    type('Bookmark URL', 'nope');
    press('Save bookmark');
    expect(screen.getByLabelText('Bookmark URL')).toBeTruthy();
  });
});
