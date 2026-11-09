import { parseTodos } from '@kaihuman/formats';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert, type AlertButton, Share } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMilestoneTo,
  addTodoTask,
  setTodoPromptAt,
  todosView,
} from '../../components/widgets/todos-tile.js';
import type { Ctx } from './bodies.js';
import { Todos } from './bodies.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const res = (r: { ok: boolean; content?: string }) => r.content as string;

const mount = (content: string) => {
  const apply = vi.fn((_: unknown) => true);
  const ctx: Ctx = { content, now: NOW, apply, error: null };
  render(<Todos view={todosView(content, NOW)} ctx={ctx} />);
  const written = () => {
    const arg = apply.mock.calls.at(-1)?.[0] as { content: string } | string;
    return typeof arg === 'string' ? arg : arg.content;
  };
  return { apply, written };
};

const withMilestone = res(addMilestoneTo('', 'Launch', '2026-12-01', NOW));
const seed = res(
  addTodoTask(res(addTodoTask(withMilestone, 'Alpha', NOW, ['work'])), 'Beta', NOW, ['home']),
);

/** Holds a row long enough for react-native-web to fire onLongPress; returns the menu buttons. */
const longPressMenu = (testID: string): AlertButton[] => {
  const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
  vi.useFakeTimers();
  fireEvent.mouseDown(screen.getByTestId(testID), {
    button: 0,
    buttons: 1,
    clientX: 5,
    clientY: 5,
  });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
  return alert.mock.calls[0]?.[2] as AlertButton[];
};

describe('Todos tile', () => {
  it('filters rows by tag chip', () => {
    mount(seed);
    fireEvent.click(screen.getByRole('button', { name: 'Filter home' }));
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Beta')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All tags' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('adds a task with tag and milestone from the details panel', () => {
    const { written } = mount(seed);
    expect(screen.queryByTestId('todo-details')).toBeNull();
    fireEvent.click(screen.getByTestId('todo-details-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Tag work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Milestone Launch' }));
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Gamma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const gamma = parseTodos(written()).items.find((i) => i.text === 'Gamma');
    expect(gamma?.tags).toEqual(['work']);
    expect(gamma?.milestoneId).toBe(parseTodos(seed).milestones[0]?.id);
  });

  it('manages milestones in a sheet', () => {
    const { written } = mount(seed);
    fireEvent.click(screen.getByTestId('todo-milestones'));
    fireEvent.change(screen.getByLabelText('New milestone'), { target: { value: 'Beta release' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    expect(parseTodos(written()).milestones.map((m) => m.name)).toContain('Beta release');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Launch' }));
    fireEvent.change(screen.getByLabelText('Milestone name'), { target: { value: 'Ship' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(parseTodos(written()).milestones.map((m) => m.name)).toContain('Ship');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Launch' }));
    expect(parseTodos(written()).milestones.map((m) => m.name)).not.toContain('Launch');
  });

  it('long press offers status, milestone, due and prompt actions', () => {
    const { written } = mount(seed);
    const buttons = longPressMenu('todo-0');
    expect(buttons.map((b) => b.text)).toEqual([
      'Start',
      'Mark done',
      'Reject',
      'Milestone…',
      'Due date…',
      'Add AI prompt…',
      'Cancel',
    ]);
    buttons.find((b) => b.text === 'Start')?.onPress?.();
    expect(parseTodos(written()).items[0]?.status).toBe('in-progress');
  });

  it('marks tasks that have an AI prompt', () => {
    mount(res(setTodoPromptAt(seed, 0, 'Do the thing', 'ref.md')));
    expect(screen.getAllByLabelText('Has AI prompt')).toHaveLength(1);
  });

  it('edits a prompt and shares it through the share sheet', () => {
    const share = vi
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const { written } = mount(seed);
    const buttons = longPressMenu('todo-0');
    act(() => buttons.find((b) => b.text === 'Add AI prompt…')?.onPress?.());
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Summarise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy or share' }));
    expect(share).toHaveBeenCalledWith({ message: 'Summarise' });
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }));
    expect(parseTodos(written()).items[0]?.prompt?.lines).toEqual(['Summarise']);
  });
});
