import { describe, expect, it, vi } from 'vitest';

// On web these Expo listeners throw ("addListener is not a function"), which blanked the preview.
vi.mock('expo-battery', () => ({
  addLowPowerModeListener: () => {
    throw new TypeError('addListener is not a function');
  },
  isLowPowerModeEnabledAsync: async () => false,
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: () => {
    throw new TypeError('addListener is not a function');
  },
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'background' },
}));

describe('startSync on a platform without some Expo listeners', () => {
  it('starts and stops without throwing', async () => {
    const { startSync } = await import('./runtime.js');
    const bridge = {
      load: async () => undefined,
      reconcile: async () => 0,
      sync: async () => undefined,
    };
    let stop: (() => void) | undefined;
    expect(() => {
      stop = startSync({ bridge });
    }).not.toThrow();
    expect(() => stop?.()).not.toThrow();
  });
});
