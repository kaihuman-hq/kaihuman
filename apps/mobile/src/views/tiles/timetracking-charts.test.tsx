import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Charts } from './timetracking-charts.js';

afterEach(cleanup);

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const content = `iso date;time\n${today};01:00,02:00,03:00,05:00\n`;

describe('Charts', () => {
  it('starts on the daily chart and switches to monthly bars', () => {
    render(<Charts content={content} />);
    expect(screen.getByTestId('daily-chart')).toBeTruthy();
    expect(screen.getByText('Breaks (dashed)')).toBeTruthy();
    fireEvent.click(screen.getByText('Monthly'));
    expect(screen.getByTestId(`bar-${today.slice(0, 7)}`).getAttribute('aria-label')).toBe(
      `${today.slice(0, 7)}, 3h`,
    );
    expect(screen.queryByText('Breaks (dashed)')).toBeNull();
  });

  it('weekly shows bars', () => {
    render(<Charts content={content} />);
    fireEvent.click(screen.getByText('Weekly'));
    expect(screen.getByLabelText('weekly work hours')).toBeTruthy();
  });

  it('shows an empty message without history', () => {
    render(<Charts content={'iso date;time\n'} />);
    expect(screen.getByText('No tracked time in the last year.')).toBeTruthy();
  });
});
