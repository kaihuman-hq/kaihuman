/**
 * The braindump window: `createBraindumpWindow` from `@lifosy/palette`, answered by the Rust
 * daemon. The daemon shows the window and says `braindump:open`; the page hides it again.
 */
import { type ActionPort, type Braindump, createBraindumpWindow } from '@lifosy/palette';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

/** The same bridge as the palette's: every request goes to `palette_request` in Rust. */
const port: ActionPort = {
  send: (request) =>
    invoke('palette_request', { request }).catch((error: unknown) => {
      throw new Error(String(error));
    }) as never,
};

const braindumps = createBraindumpWindow(document.body, port, {
  hide: () => void invoke('hide_braindump'),
  copy: async (text) => {
    await invoke('copy_text', { text }).catch((error: unknown) => {
      throw new Error(String(error));
    });
  },
});

await listen<{ id: Braindump['id'] | null }>('braindump:open', (event) => {
  void braindumps.open(event.payload.id ?? undefined);
});
await listen('braindump:hidden', () => void braindumps.hidden());
await invoke('braindump_ready');
