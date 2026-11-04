import {
  addStep,
  addTrip,
  emptyStep,
  parseTravel,
  serializeTravel,
  type TravelDoc,
} from '@kaihuman/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TravelAddForm } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/TravelAddForm';
import { TravelWidget } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/TravelWidget';

const EMPTY: TravelDoc = { version: 1, currency: 'EUR', trips: [] };

const withTrips = (): string => {
  let doc = addTrip(EMPTY, { title: 'Rome', start: '2026-05-15', end: '2026-05-20' }, 't1');
  doc = addTrip(doc, { title: 'Oslo', start: '2026-08-01', end: '2026-08-05' }, 't2');
  doc = addStep(doc, 't1', { ...emptyStep('hotel', 's1'), cost: 300 } as never);
  doc = addStep(doc, 't1', { ...emptyStep('flight', 's2'), cost: 150 } as never);
  return serializeTravel(doc);
};

let host: HTMLDivElement;

/** Re-renders with each saved content so successive edits build on each other. */
const mountFocus = (content: string) => {
  const onChange = vi.fn((next: string) => {
    act(() => {
      render(<TravelWidget content={next} mode="FOCUS" onChange={onChange} />, host);
    });
  });
  act(() => {
    render(<TravelWidget content={content} mode="FOCUS" onChange={onChange} />, host);
  });
  return onChange;
};

const typeInto = (el: HTMLInputElement | null, value: string) => {
  if (!el) throw new Error('No such field');
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const byLabel = <T extends HTMLElement = HTMLInputElement>(label: string, index = 0): T => {
  const found = host.querySelectorAll<T>(`[aria-label="${label}"]`)[index];
  if (!found) throw new Error(`No "${label}" #${index}`);
  return found;
};

const saved = (onChange: ReturnType<typeof vi.fn>) => parseTravel(onChange.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 10, 12, 0, 0));
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe('TravelWidget small tile', () => {
  it('shows the next trip, countdown, trip count and total cost', () => {
    act(() => {
      render(<TravelWidget content={withTrips()} mode="SMALL" />, host);
    });
    expect(host.textContent).toContain('Rome');
    expect(host.textContent).toContain('in 5 days');
    expect(host.textContent).toContain('2 trips');
    expect(host.textContent).toContain('450');
  });

  it('shows an empty state without trips', () => {
    act(() => {
      render(<TravelWidget content="" mode="SMALL" />, host);
    });
    expect(host.textContent).toContain('No Trips Yet');
  });
});

describe('TravelWidget focus view', () => {
  it('adds a flight step to a trip', () => {
    const onChange = mountFocus(withTrips());
    act(() => byLabel<HTMLButtonElement>('Toggle trip', 1).click());
    const select = byLabel<HTMLSelectElement>('Step type');
    act(() => {
      select.value = 'flight';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => byLabel<HTMLButtonElement>('Add step').click());

    const oslo = saved(onChange).trips.find((t) => t.id === 't2');
    expect(oslo?.steps.map((s) => s.type)).toEqual(['flight']);
  });

  it('stores an emptied cost as 0, not NaN', () => {
    const onChange = mountFocus(withTrips());
    act(() => byLabel<HTMLButtonElement>('Toggle trip').click());
    typeInto(byLabel<HTMLInputElement>('Step cost', 0), '');

    const step = saved(onChange).trips[0]?.steps.find((s) => s.id === 's1');
    expect(step).toMatchObject({ cost: 0 });
    expect(onChange.mock.calls.at(-1)?.[0]).not.toContain('null');
  });

  it('keeps a cleared cost field empty instead of redisplaying 0', () => {
    mountFocus(withTrips());
    act(() => byLabel<HTMLButtonElement>('Toggle trip').click());
    const input = byLabel<HTMLInputElement>('Step cost', 0);
    typeInto(input, '');
    expect(byLabel<HTMLInputElement>('Step cost', 0).value).toBe('');
  });

  it('adds a custom field then deletes a step', () => {
    const onChange = mountFocus(withTrips());
    act(() => byLabel<HTMLButtonElement>('Toggle trip').click());
    act(() => byLabel<HTMLButtonElement>('Add custom field').click());
    typeInto(byLabel<HTMLInputElement>('Custom field key'), 'Gate');
    typeInto(byLabel<HTMLInputElement>('Custom field value'), 'B12');
    act(() => byLabel<HTMLButtonElement>('Delete step', 0).click());

    const rome = saved(onChange).trips[0];
    expect(rome?.custom).toEqual([{ key: 'Gate', value: 'B12' }]);
    expect(rome?.steps.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('TravelAddForm', () => {
  it('adds a trip with the submitted title', () => {
    const onChange = vi.fn();
    act(() => {
      render(<TravelAddForm content="" onChange={onChange} />, host);
    });
    typeInto(host.querySelector<HTMLInputElement>('#travel-title'), 'Lisbon');
    act(() => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    expect(parseTravel(onChange.mock.calls.at(-1)?.[0]).trips.map((t) => t.title)).toEqual([
      'Lisbon',
    ]);
  });
});
