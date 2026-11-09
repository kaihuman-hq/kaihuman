import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stocksView } from '../../components/widgets/stocks-tile.js';
import type { Ctx } from './bodies.js';
import { Stocks } from './stocks-body.js';

afterEach(cleanup);

const NOW = new Date(2026, 5, 15, 12, 0, 0);
const FILE = [
  'timestamp,current value,invest',
  '2026-01-10,1000,1000',
  '2026-02-10,1100,',
  '2026-03-10,1300,200',
  '2026-04-10,1400,',
  '2026-05-10,1600,100',
].join('\n');

const setup = (content = FILE) => {
  const ctx: Ctx = { content, now: NOW, apply: vi.fn(() => true), error: null };
  render(<Stocks view={stocksView(content, NOW)} ctx={ctx} />);
};

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('Stocks charts', () => {
  it('starts on the grouped bars with a legend', () => {
    setup();
    expect(screen.getByTestId('stocks-bars')).toBeTruthy();
    expect(screen.getByText('Invest')).toBeTruthy();
    expect(screen.getAllByText('Profit').length).toBeGreaterThan(1);
    expect(screen.getByText('M3/2026')).toBeTruthy();
  });

  it('draws the value line and the change chart', () => {
    setup();
    press('Value');
    expect(screen.getByTestId('stocks-value')).toBeTruthy();
    expect(screen.queryByTestId('stocks-bars')).toBeNull();
    press('Change');
    expect(screen.getByTestId('stocks-change')).toBeTruthy();
  });

  it('shows the forecast chart, projection table and model note', () => {
    setup();
    press('Forecast');
    expect(screen.getByTestId('stocks-forecast')).toBeTruthy();
    expect(screen.getAllByTestId(/^forecast-/)).toHaveLength(6);
    expect(screen.getByText('M12/2026')).toBeTruthy();
    expect(
      screen.getByText(/Linear trend · 6 periods remaining · R² = 0\.\d\d · lookback 24mo/),
    ).toBeTruthy();
    expect(screen.getByText('Projected year-end')).toBeTruthy();
    expect(screen.getByText(/^Avg month growth$/)).toBeTruthy();
  });

  it('switches the period and says when there is too little data to forecast', () => {
    setup();
    press('Forecast');
    press('Year');
    expect(screen.getByText('Need at least 2 periods of data to build a forecast.')).toBeTruthy();
    press('Change');
    expect(screen.getByText('Need at least 2 periods for a change chart.')).toBeTruthy();
    press('Week');
    expect(screen.getByTestId('stocks-change')).toBeTruthy();
  });

  it('lists the all-time high next to the other figures', () => {
    setup();
    expect(screen.getByText('All-time high')).toBeTruthy();
  });
});
