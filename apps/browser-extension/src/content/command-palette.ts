/**
 * The command palette the keyboard shortcut opens in the page.
 *
 * Bookmarks are searched locally against the cached list, so typing costs nothing. The repo search
 * hits GitHub's code-search endpoint, which has a small dedicated budget, so it runs only when the
 * user presses Tab — never while typing.
 */
import type { Bookmark } from '../background/bookmarks';
import { searchBookmarks } from '../background/bookmarks';

export interface RepoResult {
  path: string;
  name: string;
  url: string;
}

export interface PaletteHandlers {
  loadBookmarks: () => Promise<Bookmark[]>;
  searchRepo: (query: string) => Promise<RepoResult[]>;
  open: (url: string) => void;
}

export interface CommandPalette {
  toggle: () => void;
  close: () => void;
  destroy: () => void;
}

interface Row {
  title: string;
  subtitle: string;
  url: string;
}

export const PALETTE_HOST_ID = 'lifosy-command-palette';

// Inside a shadow root, so only inherited properties (font, colour) can leak in from the page —
// hence the explicit values on the container.
const STYLES = `
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.55);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    line-height: 1.4;
    color: #e6e6e6;
  }
  .panel {
    width: min(620px, 92vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  }
  input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    padding: 14px 16px;
    font: inherit;
    color: #f5f5f5;
    border-bottom: 1px solid #2a2a2a;
  }
  input::placeholder { color: #6b6b6b; }
  .status {
    padding: 6px 16px;
    font-size: 11px;
    color: #8a8a8a;
    border-bottom: 1px solid #1c1c1c;
  }
  .status[hidden] { display: none; }
  .rows { overflow-y: auto; }
  .group {
    padding: 8px 16px 4px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b6b6b;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px;
    cursor: pointer;
    border-left: 2px solid transparent;
  }
  .row[data-selected="true"] {
    background: #171717;
    border-left-color: #7dd3a7;
  }
  .row .title { color: #f5f5f5; }
  .row .subtitle {
    font-size: 11px;
    color: #8a8a8a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty { padding: 16px; color: #6b6b6b; }
  .hint {
    padding: 8px 16px;
    font-size: 11px;
    color: #8a8a8a;
    border-top: 1px solid #1c1c1c;
  }
`;

export function createCommandPalette(handlers: PaletteHandlers): CommandPalette {
  const host = document.createElement('div');
  host.id = PALETTE_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search bookmarks…';
  const status = document.createElement('div');
  status.className = 'status';
  status.hidden = true;
  const rows = document.createElement('div');
  rows.className = 'rows';
  const hint = document.createElement('div');
  hint.className = 'hint';

  panel.append(input, status, rows, hint);
  backdrop.append(panel);
  shadow.append(style, backdrop);

  let open = false;
  let bookmarks: Bookmark[] = [];
  let repoResults: RepoResult[] | null = null;
  let repoQuery = '';
  let selected = 0;
  /** Guards against a slow repo search landing after the query moved on. */
  let searchToken = 0;

  const bookmarkRows = (): Row[] =>
    searchBookmarks(bookmarks, input.value).map((bookmark) => ({
      title: bookmark.title,
      subtitle: bookmark.tags.length
        ? `${bookmark.url}  ${bookmark.tags.map((tag) => `#${tag}`).join(' ')}`
        : bookmark.url,
      url: bookmark.url,
    }));

  const repoRows = (): Row[] =>
    (repoResults ?? []).map((result) => ({
      title: result.name,
      subtitle: result.path,
      url: result.url,
    }));

  const allRows = (): Row[] => [...bookmarkRows(), ...repoRows()];

  const setStatus = (text: string | null) => {
    status.textContent = text ?? '';
    status.hidden = !text;
  };

  const render = () => {
    const bookmarkMatches = bookmarkRows();
    const repoMatches = repoRows();
    const total = bookmarkMatches.length + repoMatches.length;
    if (selected >= total) selected = Math.max(0, total - 1);

    rows.replaceChildren();
    if (total === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = bookmarks.length
        ? 'No bookmark matches.'
        : 'No bookmarks cached yet — open the console to sync.';
      rows.append(empty);
    }

    let index = 0;
    const addGroup = (label: string, groupRows: Row[]) => {
      if (groupRows.length === 0) return;
      const heading = document.createElement('div');
      heading.className = 'group';
      heading.textContent = label;
      rows.append(heading);
      for (const row of groupRows) {
        const position = index++;
        const element = document.createElement('div');
        element.className = 'row';
        element.dataset.selected = String(position === selected);
        const title = document.createElement('div');
        title.className = 'title';
        // Bookmark titles come from the repo file, so they are set as text, never as markup.
        title.textContent = row.title;
        const subtitle = document.createElement('div');
        subtitle.className = 'subtitle';
        subtitle.textContent = row.subtitle;
        element.append(title, subtitle);
        element.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(position);
        });
        rows.append(element);
      }
    };

    addGroup('Bookmarks', bookmarkMatches);
    addGroup('Repo', repoMatches);

    const query = input.value.trim();
    if (!query) hint.textContent = '↑↓ navigate · ⏎ open · esc close';
    else if (repoResults && repoQuery === query) hint.textContent = `⏎ open · esc close`;
    else hint.textContent = `⇥ tab search repo for “${query}” · ⏎ open · esc close`;
  };

  const choose = (position: number) => {
    const row = allRows()[position];
    if (!row) return;
    handlers.open(row.url);
    close();
  };

  const runRepoSearch = async () => {
    const query = input.value.trim();
    if (!query) return;
    const token = ++searchToken;
    setStatus(`Searching the repo for “${query}”…`);
    try {
      const results = await handlers.searchRepo(query);
      if (token !== searchToken) return;
      repoResults = results;
      repoQuery = query;
      setStatus(results.length ? null : `No repo matches for “${query}”`);
    } catch (e: any) {
      if (token !== searchToken) return;
      setStatus(e?.message || 'Repo search failed');
    }
    render();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const total = allRows().length;
      if (total === 0) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
      render();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      runRepoSearch();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected);
    }
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('input', () => {
    // Results from the previous query would be misleading next to new bookmark matches.
    repoResults = null;
    repoQuery = '';
    searchToken++;
    selected = 0;
    setStatus(null);
    render();
  });
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });

  function close() {
    open = false;
    host.remove();
  }

  const show = async () => {
    open = true;
    if (!host.isConnected) document.body.append(host);
    input.value = '';
    repoResults = null;
    repoQuery = '';
    selected = 0;
    setStatus(null);
    render();
    input.focus();

    try {
      bookmarks = await handlers.loadBookmarks();
    } catch (e: any) {
      setStatus(e?.message || 'Could not load bookmarks');
    }
    if (open) render();
  };

  return {
    toggle: () => {
      if (open) close();
      else void show();
    },
    close,
    destroy: () => {
      close();
      input.removeEventListener('keydown', onKeyDown);
    },
  };
}
