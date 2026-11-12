// @vitest-environment jsdom
import { parseTodos, serializeTodos, type TodoData } from '@kaihuman/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DueQuickPicks } from './DuePicker';
import { TodoWidget } from './TodoWidget';

const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T12:00:00'));
  localStorage.clear();
});
afterEach(() => {
  act(() => render(null, host));
  vi.useRealTimers();
});

const md = serializeTodos({
  items: [
    { id: 'a', text: 'old bill', status: 'backlog', tags: [], dueDate: '2026-11-01' },
    { id: 'b', text: 'call mum', status: 'backlog', tags: [], dueDate: '2026-11-12' },
    { id: 'c', text: 'gym', status: 'backlog', tags: [], dueDate: '2026-11-13' },
    { id: 'd', text: 'someday', status: 'backlog', tags: [] },
  ],
  milestones: [],
} as unknown as TodoData);

const tab = (label: string) =>
  [...host.querySelectorAll('[role="tab"]')].find((t) =>
    t.textContent?.startsWith(label),
  ) as HTMLButtonElement;
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const sectionLabels = () =>
  [...host.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));

describe('TodoWidget date views', () => {
  it('defaults to All and shows every item', () => {
    act(() => render(<TodoWidget content={md} mode="SMALL" />, host));
    expect(tab('All').getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).toContain('someday');
  });

  it('Today groups overdue first and hides undated items', () => {
    act(() => render(<TodoWidget content={md} mode="SMALL" />, host));
    click(tab('Today'));
    expect(sectionLabels()).toEqual(['Overdue', 'Today']);
    expect(host.textContent).toContain('old bill');
    expect(host.textContent).not.toContain('someday');
    expect(host.textContent).not.toContain('gym');
  });

  it('Tomorrow shows tomorrow only, with an empty-state message otherwise', () => {
    act(() => render(<TodoWidget content={md} mode="SMALL" />, host));
    click(tab('Tomorrow'));
    expect(host.textContent).toContain('gym');
    expect(host.textContent).not.toContain('call mum');
    act(() => render(null, host));
    act(() => render(<TodoWidget content={'- [ ] someday\n'} mode="SMALL" />, host));
    click(tab('Tomorrow'));
    expect(host.textContent).toContain('Nothing due tomorrow.');
  });

  it('remembers the view per storage key', () => {
    act(() =>
      render(<TodoWidget content={md} mode="SMALL" storageKey="kh/inbox.todos.md" />, host),
    );
    click(tab('Next 7 days'));
    act(() => render(null, host));
    act(() =>
      render(<TodoWidget content={md} mode="SMALL" storageKey="kh/inbox.todos.md" />, host),
    );
    expect(tab('Next 7 days').getAttribute('aria-selected')).toBe('true');
    act(() =>
      render(<TodoWidget content={md} mode="SMALL" storageKey="kh/other.todos.md" />, host),
    );
    expect(tab('All').getAttribute('aria-selected')).toBe('true');
  });

  it('sets a due date from the quick picks', () => {
    const onChange = vi.fn();
    act(() => render(<TodoWidget content={md} mode="FOCUS" onChange={onChange} />, host));
    const row = [...host.querySelectorAll('.group')].find((r) =>
      r.textContent?.includes('someday'),
    );
    click(row?.querySelector('[aria-label="Set due date"]'));
    click(
      [...host.querySelectorAll('button')].find(
        (b) => b.textContent === 'Tomorrow' && !b.getAttribute('role'),
      ),
    );
    const saved = parseTodos(onChange.mock.calls[0]?.[0] as string);
    expect(saved.items.find((i) => i.text === 'someday')?.dueDate).toBe('2026-11-13');
  });
});

describe('DueQuickPicks', () => {
  it('reports quick picks and clearing', () => {
    const onChange = vi.fn();
    act(() => render(<DueQuickPicks value="2026-11-12" onChange={onChange} />, host));
    const button = (text: string) =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === text);
    click(button('Next week'));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-16');
    click(host.querySelector('[aria-label="Clear due date"]'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
