import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickEntryView } from './quick-entry-view.js';
import type { Glance } from './tiles/glance/types.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 10, 9, 0, 0);
const glance = (withField = true): Glance => ({
  title: 'Budget',
  icon: 'wallet',
  tint: 'green',
  hero: '0',
  label: 'spent',
  ...(withField && {
    action: {
      kind: 'field' as const,
      icon: 'add' as const,
      label: 'Expense',
      placeholder: 'Amount',
      keyboard: 'decimal-pad' as const,
      submit: (c: string, v: string) =>
        Number.isNaN(Number(v))
          ? { ok: false as const, error: 'Enter a number' }
          : { ok: true as const, content: `${c}\n${v}` },
    },
  }),
});

const setup = (withField = true) => {
  const files = { read: vi.fn(async () => 'head'), write: vi.fn(async () => {}) };
  const onSaved = vi.fn();
  const onDone = vi.fn();
  render(
    <QuickEntryView
      path="b.budget.csv"
      files={files}
      glanceFor={() => glance(withField)}
      onSaved={onSaved}
      onDone={onDone}
      now={() => NOW}
    />,
  );
  return { files, onSaved, onDone };
};

describe('QuickEntryView', () => {
  it('submits the field through the glance action and writes the file', async () => {
    const { files, onSaved, onDone } = setup();
    const field = await screen.findByPlaceholderText('Amount');
    fireEvent.change(field, { target: { value: '12.5' } });
    fireEvent.click(screen.getByTestId('quick-entry-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(files.write).toHaveBeenCalledWith('b.budget.csv', 'head\n12.5');
    expect(onSaved).toHaveBeenCalledWith('b.budget.csv', 'head\n12.5');
  });

  it('shows a rejected value without writing', async () => {
    const { files, onDone } = setup();
    fireEvent.change(await screen.findByPlaceholderText('Amount'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('quick-entry-save'));
    expect(await screen.findByText('Enter a number')).toBeTruthy();
    expect(files.write).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('explains when the tile has no field action', async () => {
    setup(false);
    expect(await screen.findByText('This tile has no quick entry.')).toBeTruthy();
  });
});
