import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumptionView } from '../../components/widgets/consumption-tile.js';
import type { Ctx } from './bodies.js';
import { Consumption, ConsumptionAddForm } from './consumption-body.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const CSV = [
  'created,Gas[title:Gas;unit:m³;yearlyTarget:1200],Power[unit:kWh]',
  '2025-01-01,0,0',
  '2025-01-31,60,30',
  '2025-02-28,100,50',
  '2026-01-01,200,100',
  '2026-01-31,230,140',
].join('\n');

const setup = (content = CSV) => {
  const apply = vi.fn((_: unknown) => true);
  const ctx: Ctx = {
    content,
    now: new Date(2026, 1, 15),
    apply,
    error: null,
  };
  render(<Consumption view={consumptionView(content, ctx.now)} ctx={ctx} />);
  return { apply };
};

const addCtx = (content: string): Ctx => ({
  content,
  now: new Date(2026, 1, 15),
  apply: vi.fn((_: unknown) => true),
  error: null,
});

const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
};

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('Consumption tile', () => {
  it('the add form starts on the reading form with every meter', () => {
    const onDone = vi.fn();
    render(<ConsumptionAddForm ctx={addCtx(CSV)} onDone={onDone} />);
    expect(screen.getByRole('button', { name: 'Save reading' })).toBeTruthy();
    expect(screen.getByText('Gas (m³)')).toBeTruthy();
    expect(screen.getByText('Power (kWh)')).toBeTruthy();
    expect(screen.getByTestId('consumption-add-what')).toBeTruthy();
  });

  it('the add form with no meters starts on the meter form', () => {
    render(<ConsumptionAddForm ctx={addCtx('created')} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save meter' })).toBeTruthy();
    expect(screen.queryByTestId('consumption-add-what')).toBeNull();
  });

  it('starts on the recent readings with every meter', () => {
    setup();
    expect(screen.getByText('Gas')).toBeTruthy();
    expect(screen.getByText('Power')).toBeTruthy();
    expect(screen.queryByTestId('month-1')).toBeNull();
  });

  it('shows the monthly table for the chosen meter and year', () => {
    setup();
    press('Monthly');
    expect(screen.getAllByTestId(/^month-/)).toHaveLength(12);
    expect(screen.getByText('VS 2025')).toBeTruthy();
    press('2025');
    expect(screen.getByText('VS 2024')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Power' }).at(-1) as HTMLElement);
    expect(screen.getByTestId('month-1').getAttribute('aria-label')).toContain('Jan');
  });

  it('draws the year comparison and toggles years and mode', () => {
    setup();
    press('Compare');
    expect(screen.getByTestId('compare-chart')).toBeTruthy();
    press('Year 2025');
    expect(screen.getByRole('button', { name: 'Year 2026' }).style.opacity).toBe('0.35');
    press('Avg / day');
    expect(screen.getByText(/^Avg per day/)).toBeTruthy();
  });

  it('removes a meter from the long-press menu only after confirming', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { apply } = setup();
    longPress(screen.getByTestId('meter-Gas'));
    const menu = alert.mock.calls[0]?.[2] as AlertButton[];
    menu.find((b) => b.text === 'Remove meter')?.onPress?.();
    // The menu item only opens the confirmation; nothing is written yet.
    expect(apply).not.toHaveBeenCalled();
    const confirm = alert.mock.calls[1]?.[2] as AlertButton[];
    expect(alert.mock.calls[1]?.[0]).toBe('Remove Gas?');
    expect(confirm.find((b) => b.style === 'cancel')).toBeTruthy();
    confirm.find((b) => b.text === 'Remove meter')?.onPress?.();
    expect(apply).toHaveBeenCalledTimes(1);
    const written = apply.mock.calls[0]?.[0] as { ok: boolean; content: string };
    expect(written.ok).toBe(true);
    expect(written.content.split('\n')[0]).toBe('created,Power[unit:kWh]');
  });

  it('shows an empty line when the file has no meters', () => {
    setup('created');
    expect(screen.getByText('No meters yet.')).toBeTruthy();
  });

  it('can remove a meter that has no readings yet', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { apply } = setup('created,Gas[unit:m3]');
    longPress(screen.getByTestId('meter-Gas'));
    (alert.mock.calls[0]?.[2] as AlertButton[]).find((b) => b.text === 'Remove meter')?.onPress?.();
    (alert.mock.calls[1]?.[2] as AlertButton[]).find((b) => b.text === 'Remove meter')?.onPress?.();
    expect(apply).toHaveBeenCalledWith({ ok: true, content: 'created' });
  });
});
