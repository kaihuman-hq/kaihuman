import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  saveFile: vi.fn(async () => {}),
  createFile: vi.fn(async () => {}),
  updateFileContent: vi.fn(),
  ensureFresh: vi.fn(),
  loadTree: vi.fn(),
}));
const INBOX = 'kh/inbox.todos.md';
const WORK = 'kh/work.todos.md';
const blob = (path: string) => ({ path, type: 'blob', sha: 's', url: '' });
vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  return {
    githubFileStore: {
      ...store,
      tree: signal([blob(INBOX), blob(WORK)]),
      openFiles: signal({
        [INBOX]: { content: '- [ ] Read https://example.com/a #home\n  ::due:: 2026-11-01\n' },
        [WORK]: {
          content:
            '- [ ] Standup\n  ::due:: 2026-11-12T15:00 ::repeat:: daily\n- [ ] Later\n  ::due:: 2026-12-20\n',
        },
      }),
      appFolder: signal('kh'),
    },
  };
});
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { TasksBoardPage } = await import('./TasksBoardPage');
const core = (await import('@kaihuman/core')) as unknown as {
  githubFileStore: {
    tree: { value: unknown[] };
    openFiles: { value: Record<string, { content: string }> };
  };
};

let host: HTMLDivElement;
const button = (label: string) =>
  [...host.querySelectorAll('nav button')].find((b) => b.textContent?.startsWith(label)) as
    | HTMLButtonElement
    | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T12:00:00'));
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<TasksBoardPage />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe('TasksBoardPage', () => {
  it('shows smart lists, lists and tags with open counts', () => {
    expect(button('Today')?.textContent).toBe('Today2');
    expect(button('Next 7 Days')?.textContent).toBe('Next 7 Days2');
    expect(button('Inbox')?.textContent).toBe('Inbox1');
    expect(button('work')?.textContent).toBe('work2');
    expect(button('home')?.textContent).toBe('home1');
    expect(button('Completed')).toBeTruthy();
    expect(host.textContent).not.toContain('Trash');
  });

  it('renders Today rows with list, repeat, due time, overdue in red and links', () => {
    expect(host.querySelector('h1')?.textContent).toBe('Today');
    const rows = [...host.querySelectorAll('li')];
    expect(rows.map((r) => r.textContent)).toEqual([
      'Read https://example.com/aInboxNov 1',
      'Standupwork15:00',
    ]);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
    expect(rows[0]?.querySelector('[data-overdue]')).toBeTruthy();
    expect(rows[1]?.querySelector('[aria-label="Repeats"]')).toBeTruthy();
    expect(host.querySelector('input[type="text"]')?.getAttribute('placeholder')).toBe(
      'Add task to "Inbox"',
    );
  });

  it('completes a todo from its checkbox', () => {
    const box = host.querySelector('li input[type="checkbox"]') as HTMLInputElement;
    act(() => box.click());
    expect(store.updateFileContent).toHaveBeenCalledWith(
      INBOX,
      expect.stringContaining('- [x] Read'),
    );
    expect(store.saveFile).toHaveBeenCalledWith(INBOX);
  });

  it('reschedules a task from the quick menu, keeping its time of day', () => {
    const open = (label: string) =>
      act(() => (host.querySelector(`[aria-label="Reschedule ${label}"]`) as HTMLElement).click());
    open('Standup');
    const items = [...host.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(items).toEqual(['Tomorrow', 'Day after tomorrow', 'Next Saturday', 'Next Monday']);
    act(() => (host.querySelectorAll('[role="menuitem"]')[2] as HTMLElement).click());
    expect(store.updateFileContent).toHaveBeenCalledWith(
      WORK,
      expect.stringContaining('::due:: 2026-11-14T15:00'),
    );
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('reschedules to a custom date, date only when no time, and closes on Escape', () => {
    const btn = host.querySelector('[aria-label^="Reschedule Read"]') as HTMLElement;
    act(() => btn.click());
    const date = host.querySelector('input[type="date"]') as HTMLInputElement;
    act(() => {
      date.value = '2026-12-25';
      date.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(store.updateFileContent).toHaveBeenCalledWith(
      INBOX,
      expect.stringContaining('::due:: 2026-12-25\n'),
    );
    act(() => btn.click());
    expect(host.querySelector('[role="menu"]')).toBeTruthy();
    act(() => {
      btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('switches to a list and adds tasks to it', () => {
    act(() => button('work')?.click());
    expect(host.querySelector('h1')?.textContent).toBe('work');
    const input = host.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Add task to "work"');
    act(() => {
      input.value = 'New one';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(store.updateFileContent).toHaveBeenCalledWith(WORK, expect.stringContaining('New one'));
  });

  it('opens the sidebar behind the header icon at mobile width', () => {
    expect(host.querySelectorAll('nav').length).toBe(1);
    act(() => (host.querySelector('[aria-label="Show lists"]') as HTMLButtonElement).click());
    expect(host.querySelectorAll('nav').length).toBe(2);
    act(() => (host.querySelector('[aria-label="Close lists"]') as HTMLButtonElement).click());
    expect(host.querySelectorAll('nav').length).toBe(1);
  });

  it('lists todos left in the legacy .lifeos folder (e.g. while its migration is pending)', () => {
    const LEGACY = '.lifeos/ticktick.todos.md';
    const fs = core.githubFileStore;
    const [tree, files] = [fs.tree.value, fs.openFiles.value];
    act(() => {
      fs.tree.value = [...tree, blob(LEGACY)];
      fs.openFiles.value = { ...files, [LEGACY]: { content: '- [ ] Imported\n' } };
    });
    try {
      expect(button('ticktick')?.textContent).toBe('ticktick1');
      act(() => button('ticktick')?.click());
      expect(host.textContent).toContain('Imported');
    } finally {
      fs.tree.value = tree;
      fs.openFiles.value = files;
    }
  });
});
