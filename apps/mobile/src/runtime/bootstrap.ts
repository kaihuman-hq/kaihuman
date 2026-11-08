import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { KaihumanShared } from '../../modules/kaihuman-shared/index.js';
import { WidgetBridge } from '../adapters/widget-bridge.js';
import { startNotifications } from '../notifications/index.js';
import { installCryptoPolyfill } from './crypto-polyfill.js';
import { createNativeContainer } from './native-container.js';
import { type LinkDeps, startLinkHandling } from './pending-url.js';
import { KEYCHAIN_SERVICE, SECURE_TOKEN_KEY, startTokenSync } from './token-sync.js';

// Must match the widgets' keychain service, which is the iOS bundle id (see the widgets plugin).
// expo-constants' typings resolve the default import to the module namespace here (see app/login.tsx).
const expoConfig = (Constants as { expoConfig?: { ios?: { bundleIdentifier?: string } } | null })
  .expoConfig;
const secureOptions = { keychainService: expoConfig?.ios?.bundleIdentifier ?? KEYCHAIN_SERVICE };

let active: (() => void) | null = null;
let notificationNavigator: (href: string) => void = () => undefined;

/** The router is only available inside React; notification taps navigate through this. */
export function setNotificationNavigator(navigate: (href: string) => void): void {
  notificationNavigator = navigate;
}

/** One-time app setup; idempotent while active. Returns a disposer that also allows a fresh start. */
export function bootstrap(): () => void {
  if (active) return active;
  installCryptoPolyfill(globalThis, { getRandomValues });
  const container = createNativeContainer(KaihumanShared);
  const bridge = new WidgetBridge(container);
  const stopBridge = bridge.start();
  void bridge.reconcile().catch(() => undefined);
  const stopNotifications = startNotifications({
    container,
    bridge,
    navigate: (href) => notificationNavigator(href),
  });
  const stopToken = startTokenSync({
    shared: KaihumanShared,
    secure: {
      get: () => SecureStore.getItemAsync(SECURE_TOKEN_KEY, secureOptions),
      set: (token) => SecureStore.setItemAsync(SECURE_TOKEN_KEY, token, secureOptions),
      remove: () => SecureStore.deleteItemAsync(SECURE_TOKEN_KEY, secureOptions),
    },
  });
  active = () => {
    stopBridge();
    stopNotifications();
    stopToken();
    active = null;
  };
  return active;
}

/** Link handling over the real Linking/AppState; `navigate` comes from expo-router. */
export function startAppLinkHandling(navigate: (href: string) => void): () => void {
  const deps: LinkDeps = {
    navigate,
    consumePendingUrl: () => KaihumanShared?.consumePendingUrl() ?? null,
    getInitialUrl: () => Linking.getInitialURL(),
    onUrl: (listener) => {
      const sub = Linking.addEventListener('url', (e) => listener(e.url));
      return () => sub.remove();
    },
    onForeground: (listener) => {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') listener();
      });
      return () => sub.remove();
    },
  };
  return startLinkHandling(deps);
}
