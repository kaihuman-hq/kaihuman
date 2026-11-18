import {
  addDestination,
  emptyDestination,
  emptyVacation,
  parseVacation,
  serializeVacation,
  type VacationDoc,
} from '@kaihuman/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacationAddForm } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/VacationAddForm';
import { VacationEditForm } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/VacationEditForm';
import { VacationWidget } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/VacationWidget';

const sample = (): string => {
  let doc: VacationDoc = {
    ...emptyVacation('Summer 2027'),
    from: '2027-07-01',
    to: '2027-07-15',
    budget: 3000,
  };
  const add = (p: object) => {
    doc = addDestination(doc, { ...emptyDestination(), ...p });
  };
  add({ id: 'd1', name: 'Lisbon', status: 'shortlist', price: 900, rating: 4 });
  add({ id: 'd2', name: 'Oslo', status: 'dropped', price: 1500, address: 'Karl Johans gate 1' });
  add({
    id: 'd3',
    name: 'Rome',
    status: 'idea',
    price: 700,
    rating: 5,
    mapsUrl: 'https://m.example/r',
  });
  return serializeVacation(doc);
};

let host: HTMLDivElement;

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
const byLabel = (label: string) => {
  const el = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`No "${label}"`);
  return el;
};
const choose = (label: string, value: string) => {
  const el = byLabel(label);
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const names = () =>
  [...host.querySelectorAll('.divide-y .font-bold')].map((e) => e.textContent).filter(Boolean);

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('VacationWidget', () => {
  const mount = (mode: 'SMALL' | 'FOCUS' = 'FOCUS', extra = {}) =>
    act(() => {
      render(<VacationWidget content={sample()} mode={mode} {...extra} />, host);
    });

  it('renders destinations with header meta', () => {
    mount();
    expect(names()).toEqual(['Lisbon', 'Oslo', 'Rome']);
    expect(host.textContent).toContain('2027-07-01 → 2027-07-15');
    expect(host.textContent).toContain('3 destinations');
  });

  it('small tile shows title, shortlist and count; empty state without items', () => {
    mount('SMALL');
    expect(host.textContent).toContain('Summer 2027');
    expect(host.textContent).toContain('1 shortlisted');
    act(() => {
      render(<VacationWidget content="" mode="SMALL" />, host);
    });
    expect(host.textContent).toContain('No Destinations Yet');
  });

  it('status filter hides dropped destinations', () => {
    mount();
    choose('Filter by status', 'shortlist');
    expect(names()).toEqual(['Lisbon']);
    choose('Filter by status', 'dropped');
    expect(names()).toEqual(['Oslo']);
  });

  it('sorts by price and by rating', () => {
    mount();
    choose('Sort by', 'price');
    expect(names()).toEqual(['Rome', 'Lisbon', 'Oslo']);
    choose('Sort by', 'rating');
    expect(names()).toEqual(['Rome', 'Lisbon', 'Oslo']);
  });

  it('links to maps from address or mapsUrl override', () => {
    mount();
    const hrefs = [...host.querySelectorAll<HTMLAnchorElement>('a')].map((a) => a.href);
    expect(hrefs).toEqual([
      'https://www.google.com/maps/search/?api=1&query=Karl%20Johans%20gate%201',
      'https://m.example/r',
    ]);
  });

  it('is read-only apart from edit buttons that call back', () => {
    const onEditDestination = vi.fn();
    const onEditMeta = vi.fn();
    mount('FOCUS', { onEditDestination, onEditMeta });
    expect(host.querySelectorAll('input, textarea')).toHaveLength(0);
    clickText('EDIT');
    expect(onEditDestination).toHaveBeenCalledWith('d1');
    clickText('DETAILS');
    expect(onEditMeta).toHaveBeenCalled();
  });
});

describe('VacationAddForm', () => {
  it('adds a destination and keeps existing ones', () => {
    const onChange = vi.fn();
    const onDone = vi.fn();
    act(() => {
      render(<VacationAddForm content={sample()} onChange={onChange} onDone={onDone} />, host);
    });
    typeInto(host.querySelector('#vacation-name'), 'Porto');
    typeInto(host.querySelector('#vacation-price'), '600');
    clickText('ADD DESTINATION');
    const doc = parseVacation(onChange.mock.calls[0]?.[0]);
    expect(doc.destinations.map((d) => d.name)).toEqual(['Lisbon', 'Oslo', 'Rome', 'Porto']);
    expect(doc.destinations[3]).toMatchObject({ status: 'idea', price: 600 });
    expect(onDone).toHaveBeenCalled();
  });

  it('does not submit without a name', () => {
    const onChange = vi.fn();
    act(() => {
      render(<VacationAddForm content="" onChange={onChange} />, host);
    });
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});

describe('VacationEditForm', () => {
  it('saves file-level meta without touching destinations', () => {
    const onChange = vi.fn();
    const onDone = vi.fn();
    act(() => {
      render(<VacationEditForm content={sample()} onChange={onChange} onDone={onDone} />, host);
    });
    typeInto(byLabel('Vacation title'), 'Winter 2027');
    typeInto(byLabel('Vacation budget'), '4200');
    typeInto(byLabel('Vacation travelers'), '2');
    clickText('SAVE');
    const doc = parseVacation(onChange.mock.calls[0]?.[0]);
    expect(doc).toMatchObject({ title: 'Winter 2027', budget: 4200, travelers: 2 });
    expect(doc.destinations).toHaveLength(3);
    expect(onDone).toHaveBeenCalled();
  });

  it('saves one destination; rejects out-of-range rating', () => {
    const onChange = vi.fn();
    act(() => {
      render(
        <VacationEditForm
          content={sample()}
          destinationId="d2"
          onChange={onChange}
          onDone={() => {}}
        />,
        host,
      );
    });
    typeInto(byLabel('Destination name'), 'Bergen');
    choose('Destination status', 'booked');
    typeInto(byLabel('Destination rating'), '9');
    clickText('SAVE');
    const d = parseVacation(onChange.mock.calls[0]?.[0]).destinations.find((x) => x.id === 'd2');
    expect(d).toMatchObject({ name: 'Bergen', status: 'booked' });
    expect(d?.rating).toBeUndefined();
  });

  it('deletes a destination', () => {
    const onChange = vi.fn();
    act(() => {
      render(
        <VacationEditForm
          content={sample()}
          destinationId="d1"
          onChange={onChange}
          onDone={() => {}}
        />,
        host,
      );
    });
    clickText('DELETE DESTINATION');
    expect(parseVacation(onChange.mock.calls[0]?.[0]).destinations.map((d) => d.id)).toEqual([
      'd2',
      'd3',
    ]);
  });

  it('shows a not-found state for an unknown destination', () => {
    act(() => {
      render(
        <VacationEditForm
          content={sample()}
          destinationId="nope"
          onChange={() => {}}
          onDone={() => {}}
        />,
        host,
      );
    });
    expect(host.textContent).toContain('Destination not found');
  });
});
