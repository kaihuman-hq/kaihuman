import { beforeEach, describe, expect, it } from 'vitest';
import type { ModeItem, PaletteMode } from './command-palette.js';
import type { ActionPort, WifiNetwork } from './protocol.js';
import { signalBars, wifiMode } from './wifi.js';

let sent: object[];
let scans: { enabled: boolean; networks: WifiNetwork[] }[];

/** Answers `LIST_WIFI` from `scans` in turn, and everything else with nothing. */
const port: ActionPort = {
  send: async (request) => {
    sent.push(request);
    if (request.type !== 'LIST_WIFI') return {} as never;
    const scan = scans.shift();
    if (!scan) throw new Error('no scan left');
    return scan as never;
  },
};

const network = (ssid: string, over: Partial<WifiNetwork> = {}): WifiNetwork => ({
  ssid,
  signal: 60,
  security: 'WPA2',
  active: false,
  known: false,
  ...over,
});

const load = (mode: PaletteMode) => {
  if (!('load' in mode)) throw new Error('>w does not load');
  return mode.load();
};

const item = (items: ModeItem[], id: string) => {
  const found = items.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

beforeEach(() => {
  sent = [];
  scans = [];
});

describe('signalBars', () => {
  it('shows more bars for a stronger signal', () => {
    expect([10, 30, 60, 90].map(signalBars)).toEqual(['▂▁▁▁', '▂▄▁▁', '▂▄▆▁', '▂▄▆█']);
  });
});

describe('>w', () => {
  it('lists the radio first, then the networks the backend sent, in its order', async () => {
    scans.push({
      enabled: true,
      networks: [
        network('Home', { active: true, known: true, signal: 80 }),
        network('Cafe', { security: '', signal: 40 }),
      ],
    });
    const items = await load(wifiMode(port));
    expect(sent).toEqual([{ type: 'LIST_WIFI' }]);
    expect(items.map((entry) => [entry.title, entry.subtitle, entry.tone])).toEqual([
      ['Wi‑Fi is on', '⏎ turns it off · scanning…', 'good'],
      ['Refresh networks', '⏎ scans again', undefined],
      ['Home', '▂▄▆█ 80% · WPA2 · saved · connected', 'good'],
      ['Cafe', '▂▄▁▁ 40% · open', undefined],
    ]);
  });

  it('rescans behind the last scan while the radio is on', async () => {
    scans.push({ enabled: true, networks: [] }, { enabled: true, networks: [network('New')] });
    const mode = wifiMode(port);
    if (!('load' in mode)) throw new Error('>w does not load');
    await mode.load();
    const fresh = (await mode.refresh?.()) ?? [];
    expect(sent.at(-1)).toEqual({ type: 'LIST_WIFI', rescan: true });
    expect(fresh.map((entry) => entry.title)).toEqual(['Wi‑Fi is on', 'Refresh networks', 'New']);
    expect(fresh[0]?.subtitle).toBe('⏎ turns it off');
  });

  it('does not scan with the radio off, and ⏎ turns it on', async () => {
    scans.push({ enabled: false, networks: [] });
    const mode = wifiMode(port);
    if (!('load' in mode)) throw new Error('>w does not load');
    const items = await mode.load();
    const [radio] = items;
    expect(items).toHaveLength(1);
    expect(mode.refresh?.()).toBeNull();
    expect(radio).toMatchObject({ title: 'Wi‑Fi is off', tone: 'bad' });
    expect(await radio?.action?.run?.([])).toMatch(/^Wi‑Fi is on/);
    expect(sent.at(-1)).toEqual({ type: 'SET_WIFI', enabled: true });
  });

  it('offers a refresh that reloads the mode, and so scans again', async () => {
    scans.push({ enabled: true, networks: [] });
    expect(item(await load(wifiMode(port)), 'wifi:refresh').reloads).toBe(true);
  });

  it('asks a new secured network for its password, masked, and sends it', async () => {
    scans.push({ enabled: true, networks: [network('Cafe')] });
    const connect = item(await load(wifiMode(port)), 'wifi:Cafe').action;
    expect(connect?.prompts).toEqual([{ label: 'Password for Cafe', secret: true }]);
    expect(connect?.closes).toBe(true);
    expect(await connect?.run?.(['hunter2'])).toBe('Connected to Cafe');
    expect(sent.at(-1)).toEqual({ type: 'CONNECT_WIFI', ssid: 'Cafe', password: 'hunter2' });
  });

  it('refuses an empty password without asking the backend', async () => {
    scans.push({ enabled: true, networks: [network('Cafe')] });
    const connect = item(await load(wifiMode(port)), 'wifi:Cafe').action;
    await expect(connect?.run?.([''])).rejects.toThrow('Type the password for Cafe');
    expect(sent).toEqual([{ type: 'LIST_WIFI' }]);
  });

  it('connects to a saved or open network without asking anything', async () => {
    scans.push({
      enabled: true,
      networks: [network('Home', { known: true }), network('Free', { security: '' })],
    });
    const items = await load(wifiMode(port));
    for (const ssid of ['Home', 'Free']) {
      const connect = item(items, `wifi:${ssid}`).action;
      expect(connect?.prompts).toBeUndefined();
      await connect?.run?.([]);
      expect(sent.at(-1)).toEqual({ type: 'CONNECT_WIFI', ssid });
    }
  });

  it('says so when the network chosen is already the one connected', async () => {
    scans.push({ enabled: true, networks: [network('Home', { active: true, known: true })] });
    const connect = item(await load(wifiMode(port)), 'wifi:Home').action;
    expect(await connect?.run?.([])).toBe('Already connected to Home');
    expect(sent).toEqual([{ type: 'LIST_WIFI' }]);
  });
});
