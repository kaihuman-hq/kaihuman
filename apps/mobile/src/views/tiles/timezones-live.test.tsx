import { act, cleanup, render, screen } from '@testing-library/react';
import { AppState, type AppStateStatus } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localClock, worldClocksView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Clocks } from './timezones-body.js';

const content = JSON.stringify({
  timezones: [{ id: 'u', name: 'UTC', offset: '+00:00', cities: ['UTC'] }],
});
const START = new Date('2026-11-09T12:00:30.000Z');

let handler: ((s: AppStateStatus) => void) | undefined;
const remove = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  handler = undefined;
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_t, fn) => {
    handler = fn as (s: AppStateStatus) => void;
    return { remove } as never;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  remove.mockClear();
});

const renderClocks = () => {
  const ctx: Ctx = { content, now: START, apply: vi.fn(() => true), error: null };
  return render(<Clocks clocks={worldClocksView(content, START)} ctx={ctx} />);
};
const at = (iso: string) => localClock(new Date(iso)).time;

describe('Clocks live ticking', () => {
  it('ticks every second and flips zone rows on the minute', () => {
    renderClocks();
    expect(screen.getByText(at('2026-11-09T12:00:30Z'))).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(at('2026-11-09T12:00:31Z'))).toBeTruthy();
    expect(screen.getByText('12:00')).toBeTruthy();
    act(() => vi.advanceTimersByTime(29_000));
    expect(screen.getByText(at('2026-11-09T12:01:00Z'))).toBeTruthy();
    expect(screen.getByText('12:01')).toBeTruthy();
  });

  it('pauses while backgrounded and catches up when active again', () => {
    renderClocks();
    act(() => handler?.('background'));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByText(at('2026-11-09T12:00:30Z'))).toBeTruthy();
    act(() => handler?.('active'));
    expect(screen.getByText(at('2026-11-09T12:05:30Z'))).toBeTruthy();
    expect(screen.getByText('12:05')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(at('2026-11-09T12:05:31Z'))).toBeTruthy();
  });

  it('clears the timer and listener on unmount', () => {
    const { unmount } = renderClocks();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
