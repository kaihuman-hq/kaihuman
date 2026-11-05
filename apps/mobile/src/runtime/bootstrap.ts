import { getRandomValues } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { KaihumanShared } from '../../modules/kaihuman-shared/index.js';
import { WidgetBridge } from '../adapters/widget-bridge.js';
import { installCryptoPolyfill } from './crypto-polyfill.js';
import { createNativeContainer } from './native-container.js';
import { type LinkDeps, startLinkHandling } from './pending-url.js';
import { KEYCHAIN_SERVICE, SECURE_TOKEN_KEY, startTokenSync } from './token-sync.js';

const secureOptions = { keychainService: KEYCHAIN_SERVICE };

let active: (() => void) | null = null;

/** One-time app setup; idempotent while active. Returns a disposer that also allows a fresh start. */
export function bootstrap(): () => void {
  if (active) return active;
  installCryptoPolyfill(globalThis, { getRandomValues });
  const bridge = new WidgetBridge(createNativeContainer(KaihumanShared));
  const stopBridge = bridge.start();
  void bridge.reconcile().catch(() => undefined);
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
