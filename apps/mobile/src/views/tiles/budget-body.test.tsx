import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from './bodies.js';
import { Budget } from './budget-body.js';

afterEach(cleanup);

const FILE = [
  'name;account;category;date;value',
  'Salary;Bank;earnings;2026-11-01;2000',
  'Lunch;Cash;food;2026-11-05;12.5',
].join('\n');

const ctx = (apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content: FILE,
  now: new Date(2026, 10, 9, 12),
  apply,
  error: null,
});

const addButton = () =>
  screen.getAllByRole('button', { name: 'Add transaction' })[0] as HTMLElement;
const contentOf = (apply: ReturnType<typeof vi.fn>) =>
  (apply.mock.calls[0]?.[0] as { content: string }).content;

describe('Budget', () => {
  it('shows balance, accounts and recent transactions', () => {
    render(<Budget ctx={ctx()} />);
    expect(screen.getByText('1987.50', { selector: '*' })).toBeTruthy();
    expect(screen.getByLabelText('Account Cash')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
  });

  it('filters to one account', () => {
    render(<Budget ctx={ctx()} />);
    fireEvent.click(screen.getByLabelText('Account Cash'));
    expect(screen.getAllByText('-12.50').length).toBeGreaterThan(0);
    expect(screen.queryByText('Salary')).toBeNull();
  });

  it('adds with picked name and account and stays open for the next one', () => {
    const apply = vi.fn(() => true);
    render(<Budget ctx={ctx(apply)} />);
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4' } });
    fireEvent.click(addButton());
    expect(apply).toHaveBeenCalledOnce();
    expect(contentOf(apply)).toContain('Lunch;Cash;earnings;2026-11-09;4');
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('');
  });

  it('accepts a custom name', () => {
    const apply = vi.fn(() => true);
    render(<Budget ctx={ctx(apply)} />);
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('button', { name: 'New name' }));
    fireEvent.change(screen.getByLabelText('Name (new)'), { target: { value: 'Tea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
    fireEvent.click(addButton());
    expect(contentOf(apply)).toContain('Tea;Cash');
  });
});
