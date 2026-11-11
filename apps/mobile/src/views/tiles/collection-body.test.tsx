import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from './bodies.js';
import { Collection, CollectionAddForm } from './collection-body.js';

afterEach(cleanup);

const FILE = [
  'name::When,type::date;name::Weight,type::number,unit::kg',
  '2025-01-10;80',
  '2026-10-20;77',
].join('\n');

const ctx = (apply: Ctx['apply'] = vi.fn((_r: unknown) => true)): Ctx => ({
  content: FILE,
  now: new Date(2026, 10, 9, 12),
  apply,
  error: null,
});

describe('Collection', () => {
  it('shows series, bars and recent rows', () => {
    render(<Collection ctx={ctx()} />);
    expect(screen.getByLabelText('Weight 2026-10-20: 77')).toBeTruthy();
    expect(screen.getByText('77 kg')).toBeTruthy();
    expect(screen.getAllByText('2026-10-20').length).toBeGreaterThan(0);
  });

  it('applies the time filter to the stats', () => {
    render(<Collection ctx={ctx()} />);
    expect(screen.getByText('77 to 80, avg 78.50')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '12M' }));
    expect(screen.getByText('77 to 77, avg 77')).toBeTruthy();
  });

  it('saves an entry with the date defaulting to today', () => {
    const apply = vi.fn((_r: unknown) => true);
    const onDone = vi.fn();
    render(<CollectionAddForm ctx={ctx(apply)} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '76' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    expect((apply.mock.calls[0]?.[0] as { content: string }).content).toContain('2026-11-09;76');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('keeps the form open when the entry is rejected', () => {
    const apply = vi.fn((_r: unknown) => false);
    const onDone = vi.fn();
    render(<CollectionAddForm ctx={ctx(apply)} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
