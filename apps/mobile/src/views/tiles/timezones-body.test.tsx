import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { worldClocksView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Clocks } from './timezones-body.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const FILE = JSON.stringify({
  timezones: [
    {
      id: 'b',
      name: 'Europe/Berlin',
      offset: '+01:00',
      cities: ['Berlin'],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

const setup = (content = FILE) => {
  const apply = vi.fn((_r: unknown) => true);
  const ctx: Ctx = { content, now: NOW, apply, error: null };
  render(<Clocks clocks={worldClocksView(content, NOW)} ctx={ctx} />);
  return apply;
};

describe('Clocks body', () => {
  it('shows the large local clock and the year progress', () => {
    setup();
    expect(screen.getByText('10:00:00')).toBeTruthy();
    expect(screen.getByLabelText('Day of year, 309 of 365')).toBeTruthy();
    expect(screen.getByLabelText('Days left, 56 84.7% done')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Year progress, 84.7 percent' })).toBeTruthy();
  });

  it('titles each clock by its city', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Berlin, / })).toBeTruthy();
  });

  it('adds a zone found by city search', () => {
    const apply = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add time zone' }));
    fireEvent.change(screen.getByLabelText('Search city or zone'), { target: { value: 'tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Tokyo' }));
    const result = apply.mock.calls[0]?.[0] as { ok: boolean; content: string };
    expect(result.ok).toBe(true);
    expect(result.content).toContain('Asia/Tokyo');
  });

  it('says so when nothing matches', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add time zone' }));
    fireEvent.change(screen.getByLabelText('Search city or zone'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching zones.')).toBeTruthy();
  });

  it('offers removal on long press', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const apply = setup();
    vi.useFakeTimers();
    fireEvent.mouseDown(screen.getByRole('button', { name: /^Berlin, / }), {
      button: 0,
      buttons: 1,
      clientX: 5,
      clientY: 5,
    });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Remove Berlin')?.onPress?.();
    const result = apply.mock.calls[0]?.[0] as { ok: boolean; content: string };
    expect(result.content).not.toContain('Europe/Berlin');
  });
});
