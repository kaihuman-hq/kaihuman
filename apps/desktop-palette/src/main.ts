/**
 * The desktop palette: the shared `@lifosy/palette`, answered by the Rust daemon.
 *
 * The daemon maps the overlay and says `palette:show`; the palette closes itself (Esc, a click
 * outside, after opening something), and each close asks the daemon to hide the overlay again.
 */
import { type ActionPort, createCommandPalette, portHandlers, repoActions } from '@lifosy/palette';

/** Actions that act on browser tabs or the browser's bookmarks, which only the extension can do. */
const BROWSER_ONLY = new Set(['tabs', 'tabs-save', 'import-chrome-bookmarks']);

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

/** Every request goes to `palette_request` in Rust, which rejects with a plain message. */
const port: ActionPort = {
  send: (request) =>
    invoke('palette_request', { request }).catch((error: unknown) => {
      throw new Error(String(error));
    }) as never,
};

const palette = createCommandPalette(
  {
    ...portHandlers(port),
    open: (url) => {
      port
        .send({ type: 'OPEN_URL', url })
        .catch((error) => console.warn('could not open', url, error));
    },
    actions: () => repoActions(port).filter((action) => !BROWSER_ONLY.has(action.id)),
  },
  {
    placement: 'center',
    onClose: () => void invoke('hide_palette'),
  },
);

await listen('palette:show', () => palette.open());
await listen('palette:hide', () => palette.close());
await invoke('webview_ready');
