/**
 * The desktop palette: the shared `@lifosy/palette`, answered by the Rust daemon.
 *
 * The daemon maps the overlay and says `palette:show`; the palette closes itself (Esc, a click
 * outside, after opening something), and each close asks the daemon to hide the overlay again.
 */
import {
  type ActionPort,
  claudeCodeMode,
  claudeUsageMode,
  commandsMode,
  createCommandPalette,
  dumpMode,
  paletteModes,
  portHandlers,
  repoActions,
  wifiMode,
} from '@lifosy/palette';

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
    actions: () => [
      ...repoActions(port).filter((action) => !BROWSER_ONLY.has(action.id)),
      {
        id: 'console-login',
        title: 'Log in with the Lifosy console',
        subtitle: 'Opens the console in your browser and takes the token from there',
        // The daemon hides the overlay for the browser and reports the outcome as a notification.
        run: () => invoke<string>('console_login'),
      },
    ],
    // These read local files — dumps, omarchy's repo history, Claude's credentials — or drive the
    // machine's Wi‑Fi, which only the desktop can.
    modes: [
      ...paletteModes(port),
      commandsMode(port, { canRun: true }),
      dumpMode(port),
      claudeCodeMode(port),
      claudeUsageMode(port),
      wifiMode(port),
    ],
    copy: async (text) => {
      await invoke('copy_text', { text }).catch((error: unknown) => {
        throw new Error(String(error));
      });
    },
  },
  {
    placement: 'center',
    onClose: () => void invoke('hide_palette'),
  },
);

await listen('palette:show', () => palette.open());
await listen('palette:hide', () => palette.close());
await invoke('webview_ready');
