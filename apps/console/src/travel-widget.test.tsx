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
import { TravelEditForm } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/TravelEditForm';
import { TravelWidget } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/TravelWidget';

const EMPTY: TravelDoc = { version: 1, currency: 'EUR', trips: [] };

const withTrips = (): string => {
  let doc = addTrip(EMPTY, { title: 'Rome', start: '2026-05-15', end: '2026-05-20' }, 't1');
  doc = addTrip(doc, { title: 'Oslo', start: '2026-08-01', end: '2026-08-05' }, 't2');
  doc = addStep(doc, 't1', { ...emptyStep('hotel', 's1'), cost: 300 } as never);
  doc = addStep(doc, 't1', {
    ...emptyStep('flight', 's2'),
    cost: 150,
    address: 'Fiumicino Airport, Rome',
  } as never);
  doc = addStep(doc, 't2', {
    ...emptyStep('hotel', 's3'),
    address: 'Karl Johans gate 1',
    mapsUrl: 'https://maps.example/oslo',
    custom: [{ key: 'Floor', value: '4' }],
  } as never);
  return serializeTravel(doc);
};

let host: HTMLDivElement;

/** Re-renders with each saved content so successive edits build on each other. */
const mountEdit = (content: string, tripId: string) => {
  const onDone = vi.fn();
  const onChange = vi.fn((next: string) => {
    act(() => {
      render(
        <TravelEditForm content={next} tripId={tripId} onChange={onChange} onDone={onDone} />,
        host,
      );
    });
  });
  act(() => {
    render(
      <TravelEditForm content={content} tripId={tripId} onChange={onChange} onDone={onDone} />,
      host,
    );
  });
  return { onChange, onDone };
};

const clickText = (text: string) => {
  const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`No "${text}" button`);
  act(() => btn.click());
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
  const mountFocus = (onEditTrip?: (id: string) => void) =>
    act(() => {
      render(<TravelWidget content={withTrips()} mode="FOCUS" onEditTrip={onEditTrip} />, host);
    });

  it('is read-only: no inputs, selects or textareas', () => {
    mountFocus(() => {});
    expect(host.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(host.textContent).toContain('Rome');
    expect(host.textContent).toContain('Floor');
    expect(host.textContent).toContain('Karl Johans gate 1');
  });

  it('links to maps from the address, or the mapsUrl override', () => {
    mountFocus();
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a')].filter(
      (a) => a.textContent?.trim() === 'Open in Maps',
    );
    expect(links.map((a) => a.href)).toEqual([
      'https://www.google.com/maps/search/?api=1&query=Fiumicino%20Airport%2C%20Rome',
      'https://maps.example/oslo',
    ]);
    expect(links[0]?.target).toBe('_blank');
    expect(links[0]?.rel).toBe('noopener noreferrer');
  });

  it('opens the editor for a trip from its Edit button', () => {
    const onEditTrip = vi.fn();
    mountFocus(onEditTrip);
    act(() => byLabel<HTMLButtonElement>('Edit trip', 1).click());
    expect(onEditTrip).toHaveBeenCalledWith('t2');
  });
});

describe('TravelEditForm', () => {
  it('adds a flight step to a trip', () => {
    const { onChange, onDone } = mountEdit(withTrips(), 't2');
    const select = byLabel<HTMLSelectElement>('Step type');
    act(() => {
      select.value = 'flight';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => byLabel<HTMLButtonElement>('Add step').click());
    clickText('SAVE');

    const oslo = saved(onChange).trips.find((t) => t.id === 't2');
    expect(oslo?.steps.map((s) => s.type)).toEqual(['hotel', 'flight']);
    expect(onDone).toHaveBeenCalled();
  });

  it('stores an emptied cost as 0, not NaN', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    typeInto(byLabel<HTMLInputElement>('Step cost', 0), '');
    clickText('SAVE');

    const step = saved(onChange).trips[0]?.steps.find((s) => s.id === 's1');
    expect(step).toMatchObject({ cost: 0 });
    expect(onChange.mock.calls.at(-1)?.[0]).not.toContain('null');
  });

  it('keeps a cleared or half-typed cost field as typed', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    typeInto(byLabel<HTMLInputElement>('Step cost', 0), '');
    expect(byLabel<HTMLInputElement>('Step cost', 0).value).toBe('');
    typeInto(byLabel<HTMLInputElement>('Step cost', 0), '12.5');
    expect(byLabel<HTMLInputElement>('Step cost', 0).value).toBe('12.5');
    clickText('SAVE');
    expect(saved(onChange).trips[0]?.steps[0]).toMatchObject({ cost: 12.5 });
  });

  it('adds a custom field then deletes a step', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    act(() => byLabel<HTMLButtonElement>('Add custom field').click());
    typeInto(byLabel<HTMLInputElement>('Custom field key'), 'Gate');
    typeInto(byLabel<HTMLInputElement>('Custom field value'), 'B12');
    act(() => byLabel<HTMLButtonElement>('Delete step', 0).click());
    clickText('SAVE');

    const rome = saved(onChange).trips[0];
    expect(rome?.custom).toEqual([{ key: 'Gate', value: 'B12' }]);
    expect(rome?.steps.map((s) => s.id)).toEqual(['s2']);
  });

  it('saves a step address and a step custom field', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    typeInto(byLabel<HTMLInputElement>('Step address', 0), 'Via Roma 1');
    act(() => byLabel<HTMLButtonElement>('Add step custom field', 0).click());
    typeInto(byLabel<HTMLInputElement>('Step custom field key'), 'Room');
    typeInto(byLabel<HTMLInputElement>('Step custom field value'), '101');
    clickText('SAVE');

    const step = saved(onChange).trips[0]?.steps.find((s) => s.id === 's1');
    expect(step).toMatchObject({ address: 'Via Roma 1', custom: [{ key: 'Room', value: '101' }] });
  });

  it('reorders steps', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    act(() => byLabel<HTMLButtonElement>('Move step down', 0).click());
    clickText('SAVE');
    expect(saved(onChange).trips[0]?.steps.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('deletes the trip', () => {
    const { onChange } = mountEdit(withTrips(), 't1');
    act(() => byLabel<HTMLButtonElement>('Delete trip').click());
    expect(saved(onChange).trips.map((t) => t.id)).toEqual(['t2']);
  });

  it('saves into the latest content, keeping edits to other trips', () => {
    const onChange = vi.fn();
    const onDone = vi.fn();
    act(() => {
      render(
        <TravelEditForm content={withTrips()} tripId="t1" onChange={onChange} onDone={onDone} />,
        host,
      );
    });
    typeInto(byLabel<HTMLInputElement>('Trip title'), 'Roma');
    const elsewhere = serializeTravel(addTrip(parseTravel(withTrips()), { title: 'Bergen' }, 't3'));
    act(() => {
      render(
        <TravelEditForm content={elsewhere} tripId="t1" onChange={onChange} onDone={onDone} />,
        host,
      );
    });
    clickText('SAVE');
    expect(saved(onChange).trips.map((t) => t.title)).toEqual(['Roma', 'Oslo', 'Bergen']);
  });

  it('shows a message for a trip that is not in the file', () => {
    const { onDone } = mountEdit(withTrips(), 'missing');
    expect(host.textContent).toContain('Trip not found');
    clickText('BACK');
    expect(onDone).toHaveBeenCalled();
  });

  it('discards edits on cancel', () => {
    const { onChange, onDone } = mountEdit(withTrips(), 't1');
    typeInto(byLabel<HTMLInputElement>('Trip title'), 'Changed');
    clickText('CANCEL');
    expect(onChange).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
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
