import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptics } from '../ui/index.js';
import { TodoAddSheet } from './todo-add-sheet.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 10, 12, 0, 0);
const PATH = '.kh/errands.todos.md';
const FILE = '- [ ] old #home\n- [ ] older #work\n';

const mount = (content = FILE) => {
  const onWrite = vi.fn();
  const onClose = vi.fn();
  render(
    <TodoAddSheet path={PATH} content={content} now={NOW} onWrite={onWrite} onClose={onClose} />,
  );
  const input = () => screen.getByLabelText('Todo') as HTMLInputElement;
  const type = (v: string) => fireEvent.change(input(), { target: { value: v } });
  const submit = () => fireEvent.keyDown(input(), { key: 'Enter', keyCode: 13 });
  const items = () => parseTodos(onWrite.mock.calls.at(-1)?.[1] ?? '').items;
  return { onWrite, onClose, input, type, submit, items };
};
const chip = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('TodoAddSheet', () => {
  it('shows the caption with the file name and recent tags', () => {
    mount();
    expect(
      screen.getByText('Saved to errands.todos.md · return adds and keeps the sheet open'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Tag home')).toBeTruthy();
    expect(screen.getByLabelText('Tag work')).toBeTruthy();
  });

  it('return adds, clears the field and keeps the sheet open', () => {
    const { type, submit, input, onClose, items, onWrite } = mount();
    type('first');
    submit();
    expect(items().at(-1)?.text).toBe('first');
    expect(input().value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    type('second');
    submit();
    // The second add builds on the first one's result, not the stale prop.
    expect(parseTodos(onWrite.mock.calls.at(-1)?.[1]).items.map((i) => i.text)).toEqual([
      'old',
      'older',
      'first',
      'second',
    ]);
  });

  it('Add writes and closes; it is disabled while empty', () => {
    const { type, onClose, items } = mount();
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    type('ship');
    chip('Add');
    expect(items().at(-1)?.text).toBe('ship');
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel closes without writing', () => {
    const { onClose, onWrite } = mount();
    chip('Cancel');
    expect(onClose).toHaveBeenCalled();
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('chips set due, priority, repeat and tags', () => {
    const { type, submit, items } = mount();
    type('plan');
    chip('Tomorrow');
    chip('Priority');
    chip('Repeat');
    chip('Tag work');
    submit();
    const item = items().at(-1);
    expect(item?.dueDate).toBe('2026-11-11');
    expect(item?.priority).toBe('high');
    expect(item?.repeat).toEqual({ unit: 'day', interval: 1 });
    expect(item?.tags).toEqual(['work']);
  });

  it('next weekday chips pick the coming Saturday or Monday', () => {
    const { type, submit, items } = mount();
    type('weekend');
    chip('Next Saturday');
    submit();
    expect(items().at(-1)?.dueDate).toBe('2026-11-14');
    type('week');
    chip('Next Saturday');
    chip('Next Monday');
    submit();
    expect(items().at(-1)?.dueDate).toBe('2026-11-16');
  });

  it('toggling a due chip twice clears it; repeat alone implies today', () => {
    const { type, submit, items } = mount();
    type('a');
    chip('Today');
    chip('Today');
    chip('Repeat');
    chip('Daily');
    submit();
    expect(items().at(-1)?.dueDate).toBe('2026-11-10');
    expect(items().at(-1)?.repeat?.unit).toBe('week');
  });

  // Regression: Add wrote first and closed in the same tick, so the write's fan-out (store
  // signals, sync, dashboard reload) landed on a sheet being torn down, and a failed save
  // was an unhandled rejection. Both crashed the iOS app.
  it('Add closes the sheet before it writes', () => {
    const order: string[] = [];
    const onWrite = vi.fn(() => {
      order.push('write');
    });
    const onClose = vi.fn(() => {
      order.push('close');
    });
    render(
      <TodoAddSheet path={PATH} content={FILE} now={NOW} onWrite={onWrite} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText('Todo'), { target: { value: 'ship' } });
    chip('Add');
    expect(order).toEqual(['close', 'write']);
  });

  it('a failed save gives error feedback instead of an unhandled rejection', async () => {
    const error = vi.spyOn(haptics, 'error');
    const onWrite = vi.fn(async () => {
      throw new Error('offline');
    });
    render(
      <TodoAddSheet path={PATH} content={FILE} now={NOW} onWrite={onWrite} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Todo'), { target: { value: 'ship' } });
    chip('Add');
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });
});
