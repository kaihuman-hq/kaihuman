import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Bookmark,
  parseBookmarks,
  serializeBookmarks,
} from '../../../packages/ui/src/LifeOS/Organisms/Widgets/BookmarksLogic';
import { BookmarksWidget } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/BookmarksWidget';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (id: string, title: string, url: string): Bookmark => ({
  id,
  title,
  url,
  tags: [],
  createdAt: NOW,
  updatedAt: NOW,
  useCount: 0,
  lastUsedAt: '',
  pinned: false,
});

const CONTENT = serializeBookmarks({
  bookmarks: [
    bookmark('b1', 'Alpha docs', 'https://alpha.example/'),
    bookmark('b2', 'Beta blog', 'https://beta.example/'),
    bookmark('b3', 'Gamma docs', 'https://gamma.example/'),
  ],
  updatedAt: NOW,
});

let host: HTMLDivElement;

const mount = (onChange = vi.fn()) => {
  act(() => {
    render(<BookmarksWidget content={CONTENT} mode="FOCUS" onChange={onChange} />, host);
  });
  return onChange;
};

const typeInto = (field: HTMLInputElement | null, value: string) => {
  if (!field) throw new Error('No such field');
  act(() => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const search = (query: string) =>
  typeInto(host.querySelector<HTMLInputElement>('input[placeholder="Search bookmarks..."]'), query);

const field = (label: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

/** The nth visible row's button with this aria-label. */
const rowButton = (label: string, index = 0) => {
  const found = host.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)[index];
  if (!found) throw new Error(`No "${label}" button #${index}`);
  return found;
};

const buttonByText = (text: string) => {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
};

const submit = () =>
  act(() => {
    host.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  });

const saved = (onChange: ReturnType<typeof vi.fn>) =>
  parseBookmarks(onChange.mock.calls.at(-1)?.[0]).bookmarks;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('BookmarksWidget editing', () => {
  it('renames and relinks the bookmark found by a search', () => {
    const onChange = mount();
    search('gamma');
    act(() => rowButton('Edit').click());

    expect(field('Bookmark title')?.value).toBe('Gamma docs');
    typeInto(field('Bookmark title'), 'Gamma handbook');
    typeInto(field('Bookmark URL'), 'https://gamma.example/handbook');
    submit();

    expect(saved(onChange).map((b) => [b.id, b.title, b.url])).toEqual([
      ['b1', 'Alpha docs', 'https://alpha.example/'],
      ['b2', 'Beta blog', 'https://beta.example/'],
      ['b3', 'Gamma handbook', 'https://gamma.example/handbook'],
    ]);
  });

  it('shows a rejected url inline and keeps the editor open', () => {
    const onChange = mount();
    act(() => rowButton('Edit').click());
    typeInto(field('Bookmark URL'), 'https://beta.example');
    submit();

    expect(onChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain('That page is already bookmarked');
    expect(field('Bookmark URL')).not.toBeNull();
  });

  it('cancel leaves the file untouched', () => {
    const onChange = mount();
    act(() => rowButton('Edit').click());
    typeInto(field('Bookmark title'), 'Nope');
    act(() => buttonByText('CANCEL').click());

    expect(onChange).not.toHaveBeenCalled();
    expect(field('Bookmark title')).toBeNull();
  });

  it('deletes the matching bookmark, not the one at the same unfiltered position', () => {
    const onChange = mount();
    search('docs');
    act(() => rowButton('Delete', 1).click());

    expect(saved(onChange).map((b) => b.id)).toEqual(['b1', 'b2']);
  });
});
