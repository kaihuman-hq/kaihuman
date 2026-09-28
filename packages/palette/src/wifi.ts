/**
 * `>w` — Wi‑Fi on the desktop: the radio's state as the first row, then the networks in range.
 * The last scan shows at once and a fresh one replaces it when it arrives, since scanning takes a
 * few seconds.
 */
import type { ModeItem, PaletteMode } from './command-palette.js';
import type { ActionPort, WifiNetwork } from './protocol.js';

/** `▂▄▆█` for a strong signal, `▂▁▁▁` for a weak one. */
export const signalBars = (signal: number) => {
  const level = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return '▂▄▆█'.slice(0, level).padEnd(4, '▁');
};

/** A secured network with no saved profile, which cannot connect without its password. */
const needsPassword = (network: WifiNetwork) => !network.known && network.security !== '';

const radioItem = (port: ActionPort, enabled: boolean, scanning: boolean): ModeItem => ({
  id: 'wifi:radio',
  title: enabled ? 'Wi‑Fi is on' : 'Wi‑Fi is off',
  subtitle: enabled ? `⏎ turns it off${scanning ? ' · scanning…' : ''}` : '⏎ turns it on',
  tone: enabled ? 'good' : 'bad',
  action: {
    id: 'wifi:radio',
    title: enabled ? 'Turn Wi‑Fi off' : 'Turn Wi‑Fi on',
    recent: false,
    run: async () => {
      await port.send({ type: 'SET_WIFI', enabled: !enabled });
      return enabled ? 'Wi‑Fi is off' : 'Wi‑Fi is on — >w lists the networks once it has scanned';
    },
  },
});

const networkItem = (port: ActionPort, network: WifiNetwork): ModeItem => {
  const { ssid } = network;
  const subtitle = [
    `${signalBars(network.signal)} ${network.signal}%`,
    network.security || 'open',
    ...(network.known ? ['saved'] : []),
    ...(network.active ? ['connected'] : []),
  ].join(' · ');
  const asks = needsPassword(network);
  return {
    id: `wifi:${ssid}`,
    title: ssid,
    subtitle,
    ...(network.active ? { tone: 'good' as const } : {}),
    action: network.active
      ? {
          id: `wifi:${ssid}`,
          title: ssid,
          recent: false,
          run: async () => `Already connected to ${ssid}`,
        }
      : {
          id: `wifi:${ssid}`,
          title: `Connect to ${ssid}`,
          recent: false,
          closes: true,
          ...(asks ? { prompts: [{ label: `Password for ${ssid}`, secret: true }] } : {}),
          run: async ([password = '']) => {
            if (asks && !password) throw new Error(`Type the password for ${ssid}`);
            await port.send({ type: 'CONNECT_WIFI', ssid, ...(asks ? { password } : {}) });
            return `Connected to ${ssid}`;
          },
        },
  };
};

const wifiItems = (
  port: ActionPort,
  enabled: boolean,
  networks: WifiNetwork[],
  scanning: boolean,
) => [radioItem(port, enabled, scanning), ...networks.map((network) => networkItem(port, network))];

/** `>w` — desktop only: it drives NetworkManager through `nmcli`. */
export const wifiMode = (port: ActionPort): PaletteMode => {
  /** Whether the last load found the radio on, so only then is a scan worth waiting for. */
  let enabled = false;
  return {
    prefix: 'w',
    title: 'Wi‑Fi',
    placeholder: 'Search networks — ⏎ connects',
    description:
      'Wi‑Fi on or off, and the networks in range — ⏎ connects, asking for the password when a network has none saved (NetworkManager, through nmcli)',
    // Connected first, then by signal: a recent network moved to the top would hide that order.
    recents: false,
    load: async () => {
      const answer = await port.send({ type: 'LIST_WIFI' });
      enabled = answer.enabled;
      return wifiItems(port, answer.enabled, answer.networks, answer.enabled);
    },
    refresh: () => {
      if (!enabled) return null;
      return (async () => {
        const answer = await port.send({ type: 'LIST_WIFI', rescan: true });
        return wifiItems(port, answer.enabled, answer.networks, false);
      })();
    },
  };
};
