/**
 * The braindump window (doc/braindump.md): a text area that saves as you type and syncs to the
 * repo when you stop, with a list of braindumps of its own on ⌃O. The desktop hosts it in a window
 * next to the palette; it only needs a port answering the braindump requests.
 *
 * Saving here is local and quick (`SAVE_BRAINDUMP`, 400 ms after the last key); GitHub follows
 * (`SYNC_BRAINDUMPS`) when the window hides or switches braindumps, after 30 s without typing,
 * at least every 2 minutes while typing goes on, and a minute after a sync failed.
 *
 * ⌃F finds in the text. A textarea cannot style part of its text, so the matches are drawn as
 * `<mark>`s in a copy of the text laid out the same way behind it (the textarea is transparent).
 */
import { type BraindumpId, braindumpTitle } from '@lifosy/formats';
import { formatStamp, plural } from './actions.js';
import { filterModeItems, type ModeItem } from './command-palette.js';
import type { ActionPort, Braindump } from './protocol.js';

export const BRAINDUMP_SAVE_DELAY_MS = 400;
export const BRAINDUMP_IDLE_SYNC_MS = 30_000;
export const BRAINDUMP_MAX_UNSYNCED_MS = 120_000;
export const BRAINDUMP_RETRY_MS = 60_000;

/** What the window asks of the app around it. */
export interface BraindumpHost {
  hide: () => void;
  copy: (text: string) => Promise<void>;
}

export interface BraindumpWindow {
  /** Shows a braindump, or — without `id` — a new one, unless the one showing is still empty. */
  open: (id?: BraindumpId) => Promise<void>;
  /** The window was hidden from outside (its close button): saves and syncs. */
  hidden: () => Promise<void>;
  /** Resolves once everything typed is saved here and the last sync asked for has answered. */
  settled: () => Promise<void>;
}

const HINTS = 'Esc hide · ⌃F find · ⌃N new · ⌃O braindumps · ⌃⏎ copy all';

export interface TextMatch {
  start: number;
  end: number;
}

/** Where `query` occurs in `text`, ignoring case; nothing for an empty query. */
export const findMatches = (text: string, query: string): TextMatch[] => {
  if (!query) return [];
  // A RegExp rather than `toLowerCase`, which can change a string's length and so the offsets.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

const time = (ms: number) => formatStamp(new Date(ms)).slice(11);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const createBraindumpWindow = (
  root: HTMLElement,
  port: ActionPort,
  host: BraindumpHost,
  now: () => number = Date.now,
): BraindumpWindow => {
  const editorView = element('div', 'braindump-editor');
  const marks = element('div', 'braindump-marks');
  marks.setAttribute('aria-hidden', 'true');
  const editor = element('textarea', 'braindump-text');
  editor.placeholder = 'Type — it is saved as you go, and in the repo once you stop.';
  editor.spellcheck = true;
  editorView.append(marks, editor);
  const findBar = element('div', 'braindump-find');
  const findInput = element('input', 'braindump-find-input');
  findInput.placeholder = 'Find in this braindump';
  const findCount = element('span', 'braindump-find-count');
  const findHints = element('span', 'braindump-find-hints');
  findHints.textContent = '⏎ next · ⇧⏎ previous · Esc close';
  findBar.append(findInput, findCount, findHints);
  findBar.hidden = true;
  const listView = element('div', 'braindump-list');
  const filter = element('input', 'braindump-filter');
  filter.placeholder = 'Search braindumps — ⏎ opens one, Esc goes back';
  const rows = element('ul', 'braindump-rows');
  listView.append(filter, rows);
  listView.hidden = true;
  const status = element('div', 'braindump-status');
  const title = element('span', 'braindump-title');
  const state = element('span', 'braindump-state');
  const hints = element('span', 'braindump-hints');
  hints.textContent = HINTS;
  status.append(title, state, hints);
  root.append(editorView, listView, findBar, status);

  /** The braindump showing; `id` arrives with its first save. */
  let current: { id?: BraindumpId } = {};
  /**
   * What the save chain last wrote for `current`, so an unchanged text is not written again;
   * `null` after a failed save, so the next attempt writes whatever is there.
   */
  let saved: string | null = '';
  let saving: Promise<void> = Promise.resolve();
  let syncing: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the oldest edit not yet sent to GitHub was made. */
  let unsyncedSince: number | null = null;
  let listed: Braindump[] = [];
  let selected = 0;
  let found: TextMatch[] = [];
  /** The match the find bar is on, an index into `found`. */
  let foundAt = 0;

  const showState = (text: string) => {
    state.textContent = text;
  };
  const showTitle = () => {
    title.textContent = editor.value.trim() ? braindumpTitle(editor.value) : 'New braindump';
  };

  const save = (): Promise<void> => {
    clearTimeout(saveTimer);
    const text = editor.value;
    const target = current;
    if (text === saved) return saving;
    saved = text;
    saving = saving
      .then(async () => {
        const { id } = await port.send({
          type: 'SAVE_BRAINDUMP',
          ...(target.id ? { id: target.id } : {}),
          text,
        });
        // Empty text deleted it; typing again starts a new one.
        target.id = id;
        if (target === current) showState('saved here');
      })
      .catch((error: unknown) => {
        if (target === current) saved = null;
        showState(`not saved — ${message(error)}`);
      });
    return saving;
  };

  const sync = (): Promise<void> => {
    clearTimeout(idleTimer);
    clearTimeout(retryTimer);
    unsyncedSince = null;
    syncing = syncing.then(async () => {
      await save();
      showState('syncing…');
      try {
        const { braindumps } = await port.send({ type: 'SYNC_BRAINDUMPS' });
        listed = braindumps;
        // A sync may have taken an edit made elsewhere; show it unless something was typed since.
        const fresh = braindumps.find((dump) => dump.id === current.id);
        if (fresh && editor.value === saved && fresh.text !== saved) {
          editor.value = saved = fresh.text;
          showTitle();
        }
        showState(`synced ${time(now())}`);
      } catch (error) {
        showState(`not synced — ${message(error)}; trying again in a minute`);
        retryTimer = setTimeout(() => void sync(), BRAINDUMP_RETRY_MS);
      }
    });
    return syncing;
  };

  /** Draws the matches behind the text, the one the find bar is on as `.current`. */
  const renderMarks = () => {
    const parts: Node[] = [];
    let from = 0;
    found.forEach((match, index) => {
      parts.push(document.createTextNode(editor.value.slice(from, match.start)));
      const mark = element('mark', index === foundAt ? 'current' : '');
      mark.textContent = editor.value.slice(match.start, match.end);
      parts.push(mark);
      from = match.end;
    });
    // The space keeps a trailing newline's empty line, as the textarea shows it.
    parts.push(document.createTextNode(`${editor.value.slice(from)} `));
    marks.replaceChildren(...parts);
    // The textarea's scrollbar narrows its text; the copy has none, so it gets the same width.
    marks.style.width = `${editor.clientWidth}px`;
    marks.scrollTop = editor.scrollTop;
    findCount.textContent = found.length
      ? `${foundAt + 1}/${found.length}`
      : findInput.value
        ? 'no matches'
        : '';
  };

  /** Scrolls the text so that the current match shows, about a third of the way down. */
  const revealMatch = () => {
    const mark = marks.querySelector<HTMLElement>('mark.current');
    if (!mark) return;
    const top = mark.offsetTop;
    if (
      top < editor.scrollTop ||
      top + mark.offsetHeight > editor.scrollTop + editor.clientHeight
    ) {
      editor.scrollTop = top - editor.clientHeight / 3;
      marks.scrollTop = editor.scrollTop;
    }
  };

  /** Finds the query again, on the first match from `from` on (the caret, at first). */
  const search = (from: number) => {
    found = findMatches(editor.value, findInput.value);
    const next = found.findIndex((match) => match.end > from);
    foundAt = next === -1 ? 0 : next;
    renderMarks();
    revealMatch();
  };

  const step = (by: 1 | -1) => {
    if (!found.length) return;
    foundAt = (foundAt + by + found.length) % found.length;
    renderMarks();
    revealMatch();
  };

  const openFind = () => {
    const picked = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (picked && !picked.includes('\n')) findInput.value = picked;
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
    search(editor.selectionStart);
  };

  /** Back to the text, with the current match selected so typing goes on from there. */
  const closeFind = () => {
    const match = found[foundAt];
    findBar.hidden = true;
    found = [];
    marks.replaceChildren();
    editor.focus();
    if (match) editor.setSelectionRange(match.start, match.end);
  };

  const edited = () => {
    if (!findBar.hidden) search(found[foundAt]?.start ?? 0);
    showTitle();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), BRAINDUMP_SAVE_DELAY_MS);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void sync(), BRAINDUMP_IDLE_SYNC_MS);
    if (unsyncedSince === null) unsyncedSince = now();
    else if (now() - unsyncedSince >= BRAINDUMP_MAX_UNSYNCED_MS) void sync();
  };

  const showEditor = () => {
    listView.hidden = true;
    editorView.hidden = editor.hidden = false;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  };

  const load = (dump: { id?: BraindumpId; text: string }) => {
    current = dump.id ? { id: dump.id } : {};
    editor.value = saved = dump.text;
    if (!findBar.hidden) search(0);
    showTitle();
    showState(dump.id ? '' : 'new');
  };

  /** Leaving a braindump: saved at once, and sent if anything in it is not on GitHub yet. */
  const leave = async () => {
    await save();
    if (unsyncedSince !== null) void sync();
  };

  const open = async (id?: BraindumpId) => {
    if (id === undefined && !current.id && !editor.value) {
      showEditor();
      return;
    }
    await leave();
    if (id === undefined) {
      load({ text: '' });
    } else {
      const { braindumps } = await port.send({ type: 'LIST_BRAINDUMPS' });
      const dump = braindumps.find((candidate) => candidate.id === id);
      load(dump ?? { text: '' });
      if (!dump) showState('that braindump is gone — this is a new one');
    }
    showEditor();
  };

  const close = async () => {
    host.hide();
    await leave();
  };

  const listItems = (): ModeItem[] =>
    listed.map((dump) => ({
      id: dump.id,
      title: braindumpTitle(dump.text),
      subtitle: `${formatStamp(new Date(dump.updatedAt))} · ${plural(dump.text.split('\n').length, 'line')}${dump.synced ? '' : ' · not synced yet'}`,
      keywords: dump.text,
    }));

  const renderList = () => {
    const items = filterModeItems(listItems(), filter.value);
    selected = Math.min(selected, Math.max(items.length - 1, 0));
    rows.replaceChildren(
      ...items.map((item, index) => {
        const row = element('li', 'braindump-row');
        row.dataset.id = item.id;
        row.setAttribute('aria-selected', String(index === selected));
        const heading = element('div', 'title');
        heading.textContent = item.title;
        const detail = element('div', 'subtitle');
        detail.textContent = item.subtitle ?? '';
        row.append(heading, detail);
        row.addEventListener('click', () => void open(item.id as BraindumpId));
        return row;
      }),
    );
    if (!items.length) {
      const empty = element('li', 'braindump-empty');
      empty.textContent = listed.length ? 'Nothing matches' : 'No braindumps yet';
      rows.append(empty);
    }
    return items;
  };

  const showList = async () => {
    await save();
    ({ braindumps: listed } = await port.send({ type: 'LIST_BRAINDUMPS' }));
    if (!findBar.hidden) closeFind();
    editorView.hidden = editor.hidden = true;
    listView.hidden = false;
    filter.value = '';
    selected = 0;
    renderList();
    filter.focus();
  };

  editor.addEventListener('input', edited);
  editor.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
    } else if (mod && event.key === 'Enter') {
      event.preventDefault();
      void host
        .copy(editor.value)
        .then(close)
        .catch((error: unknown) => showState(`not copied — ${message(error)}`));
    } else if (mod && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      void open();
    } else if (mod && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void showList();
    } else if (mod && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openFind();
    }
  });
  editor.addEventListener('scroll', () => {
    marks.scrollTop = editor.scrollTop;
  });
  window.addEventListener('resize', () => {
    if (!findBar.hidden) renderMarks();
  });
  findInput.addEventListener('input', () => search(found[foundAt]?.start ?? editor.selectionStart));
  findInput.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (mod && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      findInput.select();
    }
  });
  filter.addEventListener('input', () => {
    selected = 0;
    renderList();
  });
  filter.addEventListener('keydown', (event) => {
    const items = filterModeItems(listItems(), filter.value);
    if (event.key === 'Escape') {
      event.preventDefault();
      showEditor();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      selected = Math.min(Math.max(selected + step, 0), Math.max(items.length - 1, 0));
      renderList();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[selected];
      if (item) void open(item.id as BraindumpId);
    }
  });

  load({ text: '' });
  // Whatever an earlier session could not send goes out now.
  void sync();

  return {
    open,
    hidden: leave,
    settled: async () => {
      await save();
      await syncing;
    },
  };
};
