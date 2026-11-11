import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumptionView,
  habitView,
  stocksView,
} from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { ConsumptionAddForm } from './consumption-body.js';
import { StockAddForm } from './stocks-body.js';
import { Consumption, Habit, Stocks } from './tracker-bodies.js';

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
    const onDone = vi.fn();
    render(<StockAddForm ctx={ctx(webStocks, apply)} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Current value'), { target: { value: '7000,5' } });
    fireEvent.change(screen.getByLabelText('Invested this period'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save value' }));
    const result = apply.mock.calls[0]?.[0] as unknown as { ok: true; content: string };
    expect(result.ok).toBe(true);
    expect(stocksView(result.content)).toMatchObject({ latestValue: 7000.5, invested: 5700 });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('rejects a value that is not a number', () => {
    const apply = vi.fn((_: unknown) => false);
    const onDone = vi.fn();
    render(<StockAddForm ctx={ctx('', apply)} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Current value'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save value' }));
    expect(apply).toHaveBeenCalledWith({
      ok: false,
      error: 'Enter the current value as a number.',
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('Consumption tile', () => {
  const file = 'created,Gas[unit:m³;yearlyTarget:1200]\n2026-10-01,100\n2026-11-01,160\n';

  it("shows this year's use against the target and the recent readings", () => {
    render(<Consumption view={consumptionView(file, NOW)} ctx={ctx(file)} />);
    expect(screen.getByText('Reading 160 on 2026-11-01')).toBeTruthy();
    expect(screen.getByText('2026-11-01')).toBeTruthy();
  });

  // Regression: on mobile there was no way to add anything.
  it('adds a reading through the form', () => {
    const apply = vi.fn((_: unknown) => true);
    const onDone = vi.fn();
    render(<ConsumptionAddForm ctx={ctx(file, apply)} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Gas (m³)'), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }));
    const result = apply.mock.calls[0]?.[0] as { ok: true; content: string };
    expect(result.content.endsWith('2026-11-09,170')).toBe(true);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('offers to add a meter to an empty file', () => {
    const apply = vi.fn((_: unknown) => true);
    const onDone = vi.fn();
    render(<ConsumptionAddForm ctx={ctx('', apply)} onDone={onDone} />);
    expect(screen.queryByRole('button', { name: 'Save reading' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Meter name'), { target: { value: 'Power' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'kWh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save meter' }));
    expect(apply).toHaveBeenCalledWith({ ok: true, content: 'created,Power[unit:kWh]' });
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('Habit tile', () => {
  const file = 'iso date;goal reached\n2026-11-01;x\n2026-09-15;x\n';

  // Regression: the activity history (heatmap) was missing on mobile.
  it('renders the activity heatmap with past check-ins', () => {
    render(<Habit view={habitView(file, NOW)} ctx={ctx(file)} />);
    expect(screen.getByTestId('habit-heatmap')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2026-09-15, done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2026-09-16, not done' })).toBeTruthy();
  });

  it('checks in a past day picked on the heatmap', () => {
    const apply = vi.fn((_: unknown) => true);
    render(<Habit view={habitView(file, NOW)} ctx={ctx(file, apply)} />);
    fireEvent.click(screen.getByRole('button', { name: '2026-10-20, not done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    const result = apply.mock.calls[0]?.[0] as { ok: true; content: string };
    expect(
      habitView(result.content, NOW)
        .weeks.flat()
        .find((d) => d.date === '2026-10-20')?.reached,
    ).toBe(true);
  });

  it('offers to check in yesterday when it was missed', () => {
    const apply = vi.fn((_: unknown) => true);
    render(<Habit view={habitView(file, NOW)} ctx={ctx(file, apply)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check in yesterday' }));
    const result = apply.mock.calls[0]?.[0] as { ok: true; content: string };
    expect(habitView(result.content, NOW).checkedInYesterday).toBe(true);
  });
});
