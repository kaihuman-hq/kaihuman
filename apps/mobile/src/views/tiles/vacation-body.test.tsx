import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vacationView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { DestinationAddForm, Vacation } from './vacation-body.js';

afterEach(cleanup);

const file = JSON.stringify({
  version: 1,
  title: 'Summer',
  from: '2026-07-01',
  currency: 'EUR',
  custom: [],
  destinations: [
    { id: 'a', name: 'Rome', status: 'booked', price: 100, custom: [] },
    { id: 'b', name: 'Oslo', status: 'idea', custom: [] },
  ],
});
const ctx = (content: string, apply = vi.fn(() => true)): Ctx => ({
  content,
  now: new Date(2026, 10, 8),
  apply,
  error: null,
});

describe('Vacation', () => {
  it('lists destinations and filters by status', () => {
    render(<Vacation view={vacationView(file)} ctx={ctx(file)} />);
    expect(screen.getByText('2026-07-01')).toBeTruthy();
    expect(screen.getByTestId('destination-a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^idea/ }));
    expect(screen.queryByTestId('destination-a')).toBeNull();
    expect(screen.getByTestId('destination-b')).toBeTruthy();
  });
  it('shows the empty line', () => {
    render(<Vacation view={vacationView('')} ctx={ctx('')} />);
    expect(screen.getByText('No destinations.')).toBeTruthy();
  });
  it('adds a destination from the form', () => {
    const apply = vi.fn(() => true);
    const onDone = vi.fn();
    render(<DestinationAddForm ctx={ctx('', apply)} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Lima' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
    const r = (apply.mock.calls[0] as unknown as [{ content: string }])[0];
    expect(JSON.parse(r.content).destinations[0].name).toBe('Lima');
    expect(onDone).toHaveBeenCalledOnce();
  });
});
