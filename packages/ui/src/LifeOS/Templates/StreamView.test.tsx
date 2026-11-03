// @vitest-environment jsdom
import type { TodoItem, TodoStatus } from '@kaihuman/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByStream, StreamView } from './StreamView';

const item = (id: string, status: TodoStatus, text = id): TodoItem => ({
  id,
  text,
  status,
  tags: [],
});

const files = [
  {
    path: 'a.todos.md',
    data: {
      items: [
        item('b1', 'backlog'),
        item('d1', 'done'),
        item('p1', 'in-progress'),
        item('r1', 'rejected'),
        item('b2', 'backlog'),
      ],
    },
  },
  { path: 'empty.todos.md', data: { items: [] } },
];

describe('groupByStream', () => {
  it('lists in-progress before backlog and hides finished by default', () => {
    const [lane] = groupByStream(files, { showFinished: false });
    expect(lane?.items.map((r) => r.item.id)).toEqual(['p1', 'b1', 'b2']);
    expect(lane?.items.map((r) => r.itemIndex)).toEqual([2, 0, 4]);
  });

  it('shows done and rejected only with showFinished', () => {
    const [lane] = groupByStream(files, { showFinished: true });
    expect(lane?.items.map((r) => r.item.id)).toEqual(['p1', 'b1', 'b2', 'd1', 'r1']);
  });

  it('counts rejected as finished', () => {
    const [lane] = groupByStream(files, { showFinished: false });
    expect(lane).toMatchObject({ openCount: 2, inProgressCount: 1, doneCount: 2 });
  });

  it('keeps an empty file as a lane with zero counts', () => {
    const lane = groupByStream(files, { showFinished: true })[1];
    expect(lane).toMatchObject({ openCount: 0, inProgressCount: 0, doneCount: 0, items: [] });
  });

  it('applies the filter', () => {
    const [lane] = groupByStream(files, {
      showFinished: true,
      filter: (i) => i.id.startsWith('b'),
    });
    expect(lane?.items.map((r) => r.item.id)).toEqual(['b1', 'b2']);
    expect(lane?.doneCount).toBe(0);
  });
});

let host: HTMLDivElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host as HTMLDivElement));
    host.remove();
    host = null;
  }
});

describe('StreamView', () => {
  const setup = () => {
    const onStatusChange = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const lanes = groupByStream(files, { showFinished: true, label: (p) => p.split('.')[0] ?? p });
    act(() =>
      render(
        <StreamView lanes={lanes} fileColors={{}} onStatusChange={onStatusChange} />,
        host as HTMLDivElement,
      ),
    );
    return { onStatusChange, root: host };
  };

  it('renders one lane per file', () => {
    const { root } = setup();
    expect(root.querySelectorAll('section')).toHaveLength(2);
  });

  it('calls the handler with the next status on click', () => {
    const { onStatusChange, root } = setup();
    const btn = root.querySelector('button[aria-label^="In Progress"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('In Progress. Mark as Done');
    act(() => btn.click());
    expect(onStatusChange).toHaveBeenCalledWith('a.todos.md', 2, 'done');
  });

  it('reveals finished rows through the toggle', () => {
    const { root } = setup();
    expect(root.textContent).not.toContain('d1');
    const box = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => box.click());
    expect(root.textContent).toContain('d1');
    expect(root.textContent).toContain('r1');
  });
});
