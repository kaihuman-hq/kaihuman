import { emptyStep, parseTravel } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { travelView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { Travel } from './travel-body.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const file = JSON.stringify({
  version: 1,
  currency: 'EUR',
  trips: [
    {
      id: 'rome',
      title: 'Rome',
      start: '2026-11-20',
      end: '2026-11-25',
      destination: 'Italy',
      custom: [],
      steps: [
        { ...emptyStep('flight', 'f1'), from: 'AMS', to: 'FCO', cost: 100 },
        { ...emptyStep('hotel', 'h1'), from: '2026-11-20', to: '2026-11-25', cost: 50 },
      ],
    },
    { id: 'oslo', title: 'Oslo', custom: [], steps: [] },
  ],
});

const setup = () => {
  const apply = vi.fn(() => true);
  const ctx: Ctx = { content: file, now: NOW, apply, error: null };
  render(<Travel view={travelView(file, NOW)} ctx={ctx} />);
  return { apply };
};

const written = (apply: ReturnType<typeof vi.fn>) => {
  const arg = apply.mock.calls.at(-1)?.[0] as string | { content: string };
  return parseTravel(typeof arg === 'string' ? arg : arg.content);
};

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

/** Holds a row long enough for react-native-web to fire onLongPress. */
const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
};

describe('Travel editing', () => {
  it('shows the destination on the row and opens the edit sheet on tap', () => {
    setup();
    expect(screen.getByText(/Italy/)).toBeTruthy();
    expect(screen.queryByTestId('trip-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('trip-rome'));
    expect((field('Trip title') as HTMLInputElement).value).toBe('Rome');
    expect((field('Destination') as HTMLInputElement).value).toBe('Italy');
  });

  it('saves trip fields and keeps the other trips', () => {
    const { apply } = setup();
    fireEvent.click(screen.getByTestId('trip-rome'));
    type('Trip title', 'Rome trip');
    type('Destination', 'Lazio');
    type('Trip notes', 'Bring a hat');
    press('Add trip field');
    type('Trip field key', 'Visa');
    type('Trip field value', 'No');
    fireEvent.click(screen.getByTestId('trip-save'));
    const trips = written(apply).trips;
    expect(trips.map((t) => t.title)).toEqual(['Rome trip', 'Oslo']);
    expect(trips[0]).toMatchObject({
      destination: 'Lazio',
      notes: 'Bring a hat',
      custom: [{ key: 'Visa', value: 'No' }],
    });
    expect(screen.queryByTestId('trip-sheet')).toBeNull();
  });

  it('shows a validation error in the sheet and does not write', () => {
    const { apply } = setup();
    fireEvent.click(screen.getByTestId('trip-rome'));
    type('Trip title', '');
    fireEvent.click(screen.getByTestId('trip-save'));
    expect(screen.getByRole('alert').textContent).toContain('Give the trip a name');
    expect(apply).not.toHaveBeenCalled();
  });

  it('adds, edits, reorders and deletes steps', () => {
    const { apply } = setup();
    fireEvent.click(screen.getByTestId('trip-rome'));
    press('Step type Train');
    press('Add step');
    type('Step From', 'Rome');
    type('Step To', 'Florence');
    type('Step cost', '12.5');
    // Reorder: move the new (last) train step above the hotel, then delete the flight.
    press('Move step up');
    press('Edit step Flight');
    const deletes = screen.getAllByRole('button', { name: 'Delete step' });
    fireEvent.click(deletes[0] as HTMLElement);
    fireEvent.click(screen.getByTestId('trip-save'));
    const steps = written(apply).trips[0]?.steps ?? [];
    expect(steps.map((s) => s.type)).toEqual(['train', 'hotel']);
    expect(steps[0]).toMatchObject({ from: 'Rome', to: 'Florence', cost: 12.5 });
  }, 20_000);

  it('rejects a malformed step date', () => {
    const { apply } = setup();
    fireEvent.click(screen.getByTestId('trip-rome'));
    press('Edit step Hotel');
    type('Step Check-in', 'tomorrow');
    fireEvent.click(screen.getByTestId('trip-save'));
    expect(screen.getByRole('alert').textContent).toContain('Check-in must look like');
    expect(apply).not.toHaveBeenCalled();
  });

  it('deletes the trip from the sheet after confirming', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { apply } = setup();
    fireEvent.click(screen.getByTestId('trip-rome'));
    press('Delete trip');
    expect(apply).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    const del = buttons.find((b) => b.text === 'Delete');
    expect(del?.style).toBe('destructive');
    del?.onPress?.();
    expect(written(apply).trips.map((t) => t.id)).toEqual(['oslo']);
  });

  it('long press on a row offers a confirmed delete', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { apply } = setup();
    longPress(screen.getByTestId('trip-oslo'));
    const menu = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(menu.map((b) => b.text)).toContain('Edit trip');
    menu.find((b) => b.text === 'Delete trip')?.onPress?.();
    const confirm = alert.mock.calls[1]?.[2] as AlertButton[];
    expect(apply).not.toHaveBeenCalled();
    confirm.find((b) => b.text === 'Delete')?.onPress?.();
    expect(written(apply).trips.map((t) => t.id)).toEqual(['rome']);
  });
});
