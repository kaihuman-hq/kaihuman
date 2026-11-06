import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { KanbanBoardController } from '../screens/kanban-board.js';
import { KnowledgeScreenController } from '../screens/knowledge-screen.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { KanbanView } from '../views/kanban-view.js';
import { KnowledgeView } from '../views/knowledge-view.js';
import { haptics, ListRow, type SwipeAction } from './index.js';

const pressables = vi.hoisted(() => [] as Record<string, any>[]);

// react-native-web drops accessibilityActions from the DOM, so record the props Pressable gets.
vi.mock('react-native', async () => {
  const web = await vi.importActual<Record<string, any>>('react-native-web');
  const { createElement } = await import('react');
  return {
    ...web,
    Pressable: (props: Record<string, any>) => {
      pressables.push(props);
      return createElement(web.Pressable, props);
    },
  };
});

// react-native-web reports 'web', where swipe is deliberately off; pretend to be a native build.
const realOS = Platform.OS;
const asNative = (os: 'ios' | 'web') => {
  (Platform as { OS: string }).OS = os;
};
beforeEach(() => {
  asNative('ios');
  pressables.length = 0;
});
afterEach(() => {
  cleanup();
  (Platform as { OS: string }).OS = realOS;
  vi.restoreAllMocks();
});

const actions = (calls: string[]): SwipeAction[] => [
  { label: 'Done', side: 'leading', onPress: () => void calls.push('done') },
  { label: 'Later', onPress: () => void calls.push('later') },
  { label: 'Delete', destructive: true, onPress: () => void calls.push('delete') },
];

describe('ListRow swipe actions', () => {
  it('renders a button per action, destructive outermost on the trailing edge', () => {
    render(<ListRow title="Row" swipeActions={actions([])} />);
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((l) => l !== 'Row');
    // Leading first (left of the row), then trailing with Delete last.
    expect(labels).toEqual(['Done', 'Later', 'Delete']);
  });

  it('runs the action, closes the row and fires haptics on press', () => {
    const calls: string[] = [];
    const warning = vi.spyOn(haptics, 'warning');
    const success = vi.spyOn(haptics, 'success');
    render(<ListRow title="Row" swipeActions={actions(calls)} />);
    fireEvent.click(screen.getByTestId('swipe-action-Delete'));
    expect(calls).toEqual(['delete']);
    expect(warning).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('swipe-action-Done'));
    expect(calls).toEqual(['delete', 'done']);
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('exposes each action to assistive tech', () => {
    const calls: string[] = [];
    render(<ListRow title="Row" swipeActions={actions(calls)} />);
    const props = pressables.find((p) => p.accessibilityLabel === 'Row');
    expect(props?.accessibilityActions).toEqual([
      { name: 'swipe-0', label: 'Done' },
      { name: 'swipe-1', label: 'Later' },
      { name: 'swipe-2', label: 'Delete' },
    ]);
    props?.onAccessibilityAction({ nativeEvent: { actionName: 'swipe-2' } });
    props?.onAccessibilityAction({ nativeEvent: { actionName: 'unknown' } });
    expect(calls).toEqual(['delete']);
  });

  it('renders a plain row on web without the swipeable', () => {
    asNative('web');
    render(<ListRow title="Row" testID="row" swipeActions={actions([])} />);
    expect(screen.queryByTestId('row-swipeable')).toBeNull();
    expect(screen.queryByTestId('swipe-action-Delete')).toBeNull();
    expect(screen.getByRole('button', { name: 'Row' })).toBeTruthy();
  });

  it('does not wrap rows without actions', () => {
    render(<ListRow title="Row" testID="row" onPress={() => {}} />);
    expect(screen.queryByTestId('row-swipeable')).toBeNull();
  });
});

class MemoryFiles implements RepoFiles {
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

describe('KanbanView swipe actions', () => {
  const setup = () => {
    const files = new MemoryFiles(new Map([['.kh/inbox.todos.md', '- [ ] write tests\n']]));
    render(<KanbanView controller={new KanbanBoardController(files)} />);
    return files;
  };
  const status = (files: MemoryFiles) =>
    parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items[0]?.status;

  it('marks a todo done from the leading action', async () => {
    const files = setup();
    fireEvent.click(await screen.findByTestId('swipe-action-Done'));
    await waitFor(() => expect(status(files)).toBe('done'));
  });

  it('rejects a todo from a trailing action', async () => {
    const files = setup();
    fireEvent.click(await screen.findByTestId('swipe-action-Reject'));
    await waitFor(() => expect(status(files)).toBe('rejected'));
  });

  it('deletes a todo from the destructive trailing action', async () => {
    const files = setup();
    fireEvent.click(await screen.findByTestId('swipe-action-Delete'));
    await waitFor(() =>
      expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items).toEqual([]),
    );
  });
});

describe('KnowledgeView swipe actions', () => {
  const setup = () => {
    const map = new Map([['.kh/raw/100-first.md', '---\ntitle: "First note"\n---\nbody']]);
    const files = {
      refresh: async () => {},
      tree: () => [...map.keys()].map((path) => ({ path, type: 'blob' })),
      read: async (p: string) => map.get(p) ?? '',
      write: async () => {},
      create: async () => {},
      remove: vi.fn(async (p: string) => void map.delete(p)),
      rename: vi.fn(async (from: string, to: string) => {
        map.set(to, map.get(from) ?? '');
        map.delete(from);
      }),
    } as unknown as ContentFiles;
    render(<KnowledgeView controller={new KnowledgeScreenController({ files })} />);
    return files;
  };

  it('archives a note into processed', async () => {
    const files = setup();
    fireEvent.click(await screen.findByTestId('swipe-action-Archive'));
    await waitFor(() =>
      expect(files.rename).toHaveBeenCalledWith(
        '.kh/raw/100-first.md',
        '.kh/raw/processed/100-first.md',
      ),
    );
    await waitFor(() => expect(screen.queryByText('First note')).toBeNull());
  });

  it('deletes a note', async () => {
    const files = setup();
    fireEvent.click(await screen.findByTestId('swipe-action-Delete'));
    await waitFor(() => expect(files.remove).toHaveBeenCalledWith('.kh/raw/100-first.md'));
  });
});
