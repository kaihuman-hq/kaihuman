import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stocksView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Stocks } from './tracker-bodies.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const ctx = (content: string, apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content,
  now: NOW,
  apply,
  error: null,
});

// The web writes this shape: German stamps, a header, blank invest cells.
const webStocks =
  'timestamp,current value,invest\n01.12.2024 09:00:00,5690,5000\n01.01.2025 09:00:00,6100,500\n03.02.2025 10:30:00,6400,\n';

describe('Stocks tile', () => {
  it('renders a web-written file instead of an empty tile', () => {
    render(<Stocks view={stocksView(webStocks)} ctx={ctx(webStocks)} />);
    expect(screen.getAllByText('6400.00').length).toBeGreaterThan(0);
    expect(screen.getByText('M2/2025')).toBeTruthy();
    expect(screen.queryByText('No stock data.')).toBeNull();
  });

  it('adds a value with the amount invested', () => {
    const apply = vi.fn((_: unknown) => true);
    render(<Stocks view={stocksView(webStocks)} ctx={ctx(webStocks, apply)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByLabelText('Current value'), { target: { value: '7000,5' } });
    fireEvent.change(screen.getByLabelText('Invested this period'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save value' }));
    const result = apply.mock.calls[0]?.[0] as unknown as { ok: true; content: string };
    expect(result.ok).toBe(true);
    expect(stocksView(result.content)).toMatchObject({ latestValue: 7000.5, invested: 5700 });
  });

  it('rejects a value that is not a number', () => {
    const apply = vi.fn((_: unknown) => false);
    render(<Stocks view={null} ctx={ctx('', apply)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    fireEvent.change(screen.getByLabelText('Current value'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save value' }));
    expect(apply).toHaveBeenCalledWith({
      ok: false,
      error: 'Enter the current value as a number.',
    });
  });
});
