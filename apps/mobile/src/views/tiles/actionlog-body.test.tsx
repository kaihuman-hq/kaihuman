import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionLog } from './actionlog-body.js';
import type { Ctx } from './bodies.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const ctx = (content: string, apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content,
  now: NOW,
  apply,
  error: null,
});

const lines = Array.from(
  { length: 7 },
  (_, i) => `- 2026-11-0${i + 1} 08:00:00 Entry${i + 1}${i === 0 ? ' #early' : ''}`,
);
const FILE = `---\n---\n\n# Action Log\n\n${lines.join('\n')}\n`;

describe('ActionLog', () => {
  it('shows stats and five entries, then all on Show more', () => {
    render(<ActionLog ctx={ctx(FILE)} />);
    expect(screen.getByLabelText('Total, 7')).toBeTruthy();
    expect(screen.getByLabelText('This week, 5')).toBeTruthy();
    expect(screen.queryByText('Entry1 #early')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }));
    expect(screen.getByText('Entry1 #early')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Entry1 #early')).toBeNull();
  });

  it('searches and filters by tag', () => {
    render(<ActionLog ctx={ctx(FILE)} />);
    fireEvent.change(screen.getByLabelText('Search log'), { target: { value: 'entry3' } });
    expect(screen.getByText('Entry3')).toBeTruthy();
    expect(screen.queryByText('Entry2')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search log'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter by early' }));
    expect(screen.getByText('Entry1 #early')).toBeTruthy();
    expect(screen.queryByText('Entry2')).toBeNull();
  });

  it('logs an action with the tags field and inline tags', () => {
    const apply = vi.fn(() => true);
    render(<ActionLog ctx={ctx(FILE, apply)} />);
    fireEvent.change(screen.getByLabelText('What did you do?'), {
      target: { value: 'Ran 5k #run' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log action' }));
    const result = (apply.mock.calls[0] as unknown as [{ ok: true; content: string }])[0];
    expect(result.content).toContain('2026-11-09 12:00:00 Ran 5k #run #health');
  });

  it('switches to the report with monthly counts and top tags', () => {
    render(<ActionLog ctx={ctx(FILE)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(screen.getByText('2026-11')).toBeTruthy();
    expect(screen.getByText('#early')).toBeTruthy();
  });
});
