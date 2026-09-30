/**
 * The braindump window (doc/braindump.md): a text area that saves as you type and syncs to the
 * repo when you stop, with a list of braindumps of its own on ⌃O. The desktop hosts it in a window
 * next to the palette; it only needs a port answering the braindump requests.
 *
 * Saving here is local and quick (`SAVE_BRAINDUMP`, 400 ms after the last key); GitHub follows
 * (`SYNC_BRAINDUMPS`) when the window hides or switches braindumps, after 30 s without typing,
 * at least every 2 minutes while typing goes on, and a minute after a sync failed.
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

const HINTS = 'Esc hide · ⌃N new · ⌃O braindumps · ⌃⏎ copy all';

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
  const editor = element('textarea', 'braindump-text');
  editor.placeholder = 'Type — it is saved as you go, and in the repo once you stop.';
  editor.spellcheck = true;
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
  root.append(editor, listView, status);

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

  const edited = () => {
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
    editor.hidden = false;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  };

  const load = (dump: { id?: BraindumpId; text: string }) => {
    current = dump.id ? { id: dump.id } : {};
    editor.value = saved = dump.text;
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
    editor.hidden = true;
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
