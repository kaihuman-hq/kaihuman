import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { openBrowserAsync } from 'expo-web-browser';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLaterView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { ReadLater } from './read-later-body.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const NOW = new Date(2026, 10, 9, 12);
const content = JSON.stringify({
  items: [
    {
      id: 'a',
      url: 'https://a.test/x',
      name: 'Alpha',
      status: 'new',
      tags: ['dev'],
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: 'b',
      url: 'https://b.test/y',
      name: 'Beta',
      status: 'read',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

const setup = () => {
  const apply = vi.fn<Ctx['apply']>(() => true);
  render(
    <ReadLater view={readLaterView(content)} ctx={{ content, now: NOW, apply, error: null }} />,
  );
  return apply;
};

const nextItems = (apply: ReturnType<typeof setup>) => {
  const r = apply.mock.calls[0]?.[0];
  const text = typeof r === 'string' ? r : r?.ok ? r.content : '';
  return (JSON.parse(text) as { items: { id: string; status: string }[] }).items;
};

describe('ReadLater body', () => {
  it('tapping an item opens the link without marking it read', () => {
    const apply = setup();
    fireEvent.click(screen.getByRole('link', { name: 'Open Alpha' }));
    expect(openBrowserAsync).toHaveBeenCalledWith('https://a.test/x');
    expect(apply).not.toHaveBeenCalled();
  });

  it('shows tags', () => {
    setup();
    expect(screen.getByText('a.test · #dev')).toBeTruthy();
  });

  it('mark read and mark unread are separate buttons', () => {
    const apply = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Alpha as read' }));
    expect(nextItems(apply).find((i) => i.id === 'a')?.status).toBe('read');
    apply.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Beta as unread' }));
    expect(nextItems(apply).find((i) => i.id === 'b')?.status).toBe('new');
  });

  it('long press menu deletes a single item', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const apply = setup();
    vi.useFakeTimers();
    fireEvent.mouseDown(screen.getByTestId('read-a'), {
      button: 0,
      buttons: 1,
      clientX: 5,
      clientY: 5,
    });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(buttons.map((b) => b.text)).toEqual(['Open', 'Mark as read', 'Delete', 'Cancel']);
    buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(nextItems(apply).map((i) => i.id)).toEqual(['b']);
  });

  it('Clear all asks to confirm before wiping everything', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const apply = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(apply).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    buttons.find((b) => b.text === 'Clear all')?.onPress?.();
    expect(nextItems(apply)).toEqual([]);
  });
});
