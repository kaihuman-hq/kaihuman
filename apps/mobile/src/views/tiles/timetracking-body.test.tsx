import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { timerView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Timer } from './timetracking-body.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const CSV = 'iso date;time\n2026-11-05;08:00,10:00\n2026-11-02;09:00,10:30\n';

const setup = (content = CSV) => {
  const apply = vi.fn((_r: unknown) => true);
  const ctx: Ctx = { content, now: NOW, apply, error: null };
  render(<Timer view={timerView(content, NOW)} ctx={ctx} />);
  return apply;
};

describe('Timer body', () => {
  it('shows today and this week side by side', () => {
    setup();
    expect(screen.getByLabelText('Today, 2h 0m')).toBeTruthy();
    expect(screen.getByLabelText('This week, 3h 30m')).toBeTruthy();
  });

  it('applies a break button as a mutation of the file', () => {
    const apply = setup();
    fireEvent.click(screen.getByRole('button', { name: '30 min break' }));
    expect(apply).toHaveBeenCalledTimes(1);
    const result = apply.mock.calls[0]?.[0] as { ok: boolean; content: string };
    expect(result.ok).toBe(true);
    expect(result.content).toContain('2026-11-05;08:00,08:45,09:15,10:00');
  });

  it('passes a rejected break to apply', () => {
    const apply = setup('iso date;time\n2026-11-05;08:00,08:10\n');
    fireEvent.click(screen.getByRole('button', { name: '15 min break' }));
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ ok: false });
  });

  it('switches between the day list and the weekly bars', () => {
    setup();
    expect(screen.getByLabelText('2026-11-05, 2h 0m')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weeks' }));
    expect(screen.getByLabelText('Week of 2026-11-02, 3h 30m')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(8);
  });
});
