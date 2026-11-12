import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchDoc } from '../search/documents.js';
import type { SearchGroup } from '../search/search.js';
import { SearchView, type SearchViewProps } from './search-view.js';

afterEach(cleanup);

const doc = (title: string, over: Partial<SearchDoc> = {}): SearchDoc => ({
  id: title,
  kind: 'todo',
  title,
  path: 'a.todos.md',
  target: { type: 'route', href: '/board/todo?id=a' },
  ...over,
});

const groups: SearchGroup[] = [
  {
    kind: 'todo',
    label: 'Todos',
    total: 12,
    results: [
      {
        doc: doc('Fix build', { subtitle: 'backlog · a.todos.md' }),
        title: [
          { text: 'Fix', match: true },
          { text: ' build', match: false },
        ],
      },
    ],
  },
  {
    kind: 'note',
    label: 'Notes',
    total: 1,
    results: [
      {
        doc: doc('Plans', { kind: 'note' }),
        title: [{ text: 'Plans', match: false }],
        snippet: [
          { text: '…about the ', match: false },
          { text: 'fix', match: true },
          { text: ' soon…', match: false },
        ],
      },
    ],
  },
];

const props = (over: Partial<SearchViewProps> = {}): SearchViewProps => ({
  query: 'fix',
  onQueryChange: vi.fn(),
  groups,
  recents: [],
  onOpen: vi.fn(),
  onPickRecent: vi.fn(),
  onClearRecents: vi.fn(),
  showField: false,
  ...over,
});

const scrollTo = vi.fn();
vi.mock('react-native', async (orig) => {
  const rn = await orig<typeof import('react-native')>();
  const React = await import('react');
  const ScrollView = React.forwardRef<unknown, Record<string, unknown>>((p, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo }));
    return React.createElement(rn.ScrollView, p);
  });
  return { ...rn, ScrollView };
});

describe('SearchView', () => {
  it('scrolls back to the top when the query changes', () => {
    scrollTo.mockClear();
    const { rerender } = render(<SearchView {...props({ query: 'f' })} />);
    scrollTo.mockClear();
    rerender(<SearchView {...props({ query: 'fi' })} />);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    scrollTo.mockClear();
    rerender(<SearchView {...props({ query: 'fi' })} />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('renders grouped results with counted headers', () => {
    render(<SearchView {...props()} />);
    expect(screen.getByText('Todos (12)')).toBeTruthy();
    expect(screen.getByText('Notes (1)')).toBeTruthy();
    expect(screen.getByText('backlog · a.todos.md')).toBeTruthy();
  });

  it('renders matched segments separately so they can be emphasised', () => {
    render(<SearchView {...props()} />);
    expect(screen.getAllByTestId('match').map((el) => el.textContent)).toEqual(['Fix', 'fix']);
    expect(screen.getByText('…about the')).toBeTruthy();
  });

  it('opens a result when tapped', () => {
    const onOpen = vi.fn();
    render(<SearchView {...props({ onOpen })} />);
    fireEvent.click(screen.getByLabelText('Fix build'));
    expect(onOpen).toHaveBeenCalledWith(groups[0]?.results[0]?.doc);
  });

  it('shows recent searches for an empty query and picks and clears them', () => {
    const onPickRecent = vi.fn();
    const onClearRecents = vi.fn();
    render(
      <SearchView
        {...props({
          query: '',
          groups: [],
          recents: ['alpha', 'beta'],
          onPickRecent,
          onClearRecents,
        })}
      />,
    );
    fireEvent.click(screen.getByText('beta'));
    expect(onPickRecent).toHaveBeenCalledWith('beta');
    fireEvent.click(screen.getByText('Clear'));
    expect(onClearRecents).toHaveBeenCalled();
  });

  it('shows a hint with nothing typed and no recents', () => {
    render(<SearchView {...props({ query: '', groups: [], recents: [] })} />);
    expect(screen.getByText('Search todos, ideas, wiki, files…')).toBeTruthy();
  });

  it('shows the no-results state', () => {
    render(<SearchView {...props({ query: 'zzz', groups: [] })} />);
    expect(screen.getByText('No results for “zzz”')).toBeTruthy();
  });

  it('renders the in-view field only when asked to', () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(<SearchView {...props({ onQueryChange })} />);
    expect(screen.queryByLabelText('Search')).toBeNull();
    rerender(<SearchView {...props({ onQueryChange, showField: true })} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'abc' } });
    expect(onQueryChange).toHaveBeenCalledWith('abc');
  });
});
