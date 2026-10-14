import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWorkAlarm, runWorkCycle } from './work/poller';

vi.mock('./work/poller', () => ({
  connectWorkPanel: vi.fn(),
  ensureWorkAlarm: vi.fn(async () => {}),
  isPanelOpen: vi.fn(() => false),
  patchSnapshotThreads: vi.fn(),
  runWorkCycle: vi.fn(async () => undefined),
  watchWorkTokens: vi.fn(),
  workPollingToken: vi.fn(),
}));

let alarmListener: (alarm: { name: string }) => void;
let commandListeners: Array<(command: string, tab?: { windowId?: number }) => unknown>;
let messageListener: (
  message: unknown,
  sender: { tab?: { windowId?: number } },
  respond: (response: unknown) => void,
) => unknown;
let sidePanelOpen: ReturnType<typeof vi.fn>;
let badgeText: ReturnType<typeof vi.fn>;
let alarmsCreate: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  commandListeners = [];
  badgeText = vi.fn(async () => {});
  alarmsCreate = vi.fn();
  sidePanelOpen = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    action: { setBadgeText: badgeText, setBadgeBackgroundColor: vi.fn(async () => {}) },
    alarms: {
      create: alarmsCreate,
      get: vi.fn(async () => undefined),
      onAlarm: {
        addListener: (l: typeof alarmListener) => {
          alarmListener = l;
        },
      },
    },
    commands: {
      onCommand: {
        addListener: (l: (typeof commandListeners)[number]) => commandListeners.push(l),
      },
    },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    permissions: { contains: vi.fn(async () => true) },
    sidePanel: { open: sidePanelOpen },
    scripting: { executeScript: vi.fn(async () => []) },
    runtime: {
      getManifest: () => ({ content_scripts: [] }),
      getURL: (path: string) => `chrome-extension://id/${path}`,
      onInstalled: { addListener: vi.fn() },
      sendNativeMessage: vi.fn(async () => {
        throw new Error('Specified native messaging host not found.');
      }),
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (l: typeof messageListener) => {
          messageListener = l;
        },
      },
    },
    storage: {
      local: {
        get: (_keys: unknown, cb?: (r: unknown) => void) => (cb ? cb({}) : Promise.resolve({})),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      session: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: vi.fn() },
    },
    tabs: {
      query: async () => [{ id: 3, url: 'https://example.com/' }],
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(async (id: number) => ({ id, url: 'https://example.com/' })),
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })),
  );
  await import('./service-worker');
});

describe('work wiring in the service worker', () => {
  it('leaves an existing work alarm alone instead of re-creating it on every start', () => {
    expect(ensureWorkAlarm).toHaveBeenCalled();
    expect(alarmsCreate).not.toHaveBeenCalledWith('work', expect.anything());
  });

  it('runs the time-gated work cycle on the keep-alive alarm too', () => {
    alarmListener({ name: 'swKeepAlive' });
    expect(runWorkCycle).toHaveBeenCalledWith({ panelOpen: false });
  });

  it('clears only its own badge text when the palette shortcut runs, keeping the work count', async () => {
    // The palette injection after the badge is not under test; its outcome does not matter here.
    await Promise.allSettled(commandListeners.map((l) => l('toggle-command-palette')));
    expect(badgeText).toHaveBeenCalledWith({ tabId: 3, text: null });
    expect(badgeText).not.toHaveBeenCalledWith({ tabId: 3, text: '' });
  });

  it('opens the work panel in the window of the shortcut', () => {
    for (const l of commandListeners) l('open-work-panel', { windowId: 9 });
    expect(sidePanelOpen).toHaveBeenCalledTimes(1);
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 9 });
  });

  it('opens the work panel for the palette before anything is awaited', async () => {
    const respond = vi.fn();
    expect(messageListener({ type: 'OPEN_WORK_PANEL' }, { tab: { windowId: 4 } }, respond)).toBe(
      true,
    );
    // Called in the same turn as the message, while the user's ⏎ still counts.
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 4 });
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ success: true }));
  });

  it('answers with an error when the panel cannot open', async () => {
    sidePanelOpen.mockRejectedValueOnce(new Error('needs a user gesture'));
    const respond = vi.fn();
    messageListener({ type: 'OPEN_WORK_PANEL' }, { tab: { windowId: 4 } }, respond);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ error: 'needs a user gesture' }));
    messageListener({ type: 'OPEN_WORK_PANEL' }, {}, respond);
    await vi.waitFor(() =>
      expect(respond).toHaveBeenCalledWith({
        error: 'There is no window to open the work panel in.',
      }),
    );
  });
});
