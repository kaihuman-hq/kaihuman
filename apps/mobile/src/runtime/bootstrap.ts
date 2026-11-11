import { authStore, demoMode, getCoreStorage, githubFileStore } from '@kaihuman/core';
import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { KaihumanShared } from '../../modules/kaihuman-shared/index.js';
import { WidgetBridge } from '../adapters/widget-bridge.js';
import { setAppIntelligence } from '../intelligence/app-model.js';
import { startSmartCaptureDrain } from '../intelligence/drain.js';
import { nativeIntelligence } from '../intelligence/native.js';
import { githubCaptureFiles, saveCapture } from '../intelligence/save-capture.js';
import { rescheduleNotifications, startNotifications } from '../notifications/index.js';
import { QuickCaptureController } from '../screens/quick-capture.js';
import { refreshSearchIndex, searchIndex } from '../search/shared-index.js';
import { startSpotlightSync } from '../spotlight/sync.js';
import { checkGithubToken, recoverAuth } from '../sync/auth-recovery.js';
import { registerBackgroundSync } from '../sync/background.js';
import { setRescheduleNotifications } from '../sync/notifications-hook.js';
import { startSync } from '../sync/runtime.js';
import { createTokenRefresher, refreshEndpointFor } from '../sync/token-refresh.js';
import { installCryptoPolyfill } from './crypto-polyfill.js';
import { createNativeContainer } from './native-container.js';
import { type LinkDeps, startLinkHandling } from './pending-url.js';
import { secureOptions } from './secure-options.js';
import { SECURE_TOKEN_KEY, startTokenSync } from './token-sync.js';

let active: (() => void) | null = null;
let notificationNavigator: (href: string) => void = () => undefined;

/** The router is only available inside React; notification taps navigate through this. */
export function setNotificationNavigator(navigate: (href: string) => void): void {
  notificationNavigator = navigate;
}

let ready: Promise<unknown> = Promise.resolve();

// Same source as app/login.tsx; the worker's `/refresh` sits next to its `/login`.
const DEFAULT_GATEWAY = 'https://auth.kaihuman.com/login';
const authGateway = (): string =>
  ((Constants as { expoConfig?: { extra?: Record<string, unknown> } | null }).expoConfig?.extra
    ?.authGatewayUrl as string | undefined) ?? DEFAULT_GATEWAY;

/** Resolves once the Keychain token has been loaded into the auth store. */
export const bootstrapReady = (): Promise<unknown> => ready;

/** One-time app setup; idempotent while active. Returns a disposer that also allows a fresh start. */
export function bootstrap(): () => void {
  if (active) return active;
  installCryptoPolyfill(globalThis, { getRandomValues });
  // Device storage is already installed by the app entry (src/runtime/storage-entry.ts).
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
  ready = stopToken.ready;
  const refresher = createTokenRefresher({
    endpoint: refreshEndpointFor(authGateway()),
    session: () =>
      demoMode.peek()
        ? { refreshToken: null, expiresAt: null }
        : {
            refreshToken: authStore.refreshToken.peek(),
            expiresAt: authStore.tokenExpiresAt.peek(),
          },
    save: (session) => authStore.setSession(session),
  });
  // Every sync run (foreground or background) re-plans local notifications from fresh todos.
  setRescheduleNotifications(rescheduleNotifications);
  const stopSync = startSync({
    bridge,
    tokenReady: ready,
    // The refresh token is restored asynchronously with the rest of core's auth state.
    ensureFreshToken: () => authStore.ready.then(() => refresher.ensureFresh()),
    // The token lives in three places (core's key, core's auth record, the widgets' Keychain item);
    // after a 401 any copy GitHub still accepts beats signing the user out.
    recoverAuth: () =>
      recoverAuth({
        token: () => (demoMode.peek() ? null : authStore.token.peek()),
        candidates: async () => [
          await SecureStore.getItemAsync(SECURE_TOKEN_KEY, secureOptions).catch(() => null),
          await getCoreStorage()
            .getRecord<string>('auth', 'token')
            .catch(() => undefined),
        ],
        check: (token) => checkGithubToken(token),
        adopt: (token) => {
          authStore.token.value = token;
        },
        signOut: () => authStore.logout(),
        refresh: () => refresher.refresh(),
      }),
  });
  void registerBackgroundSync();
  const stopSpotlight = KaihumanShared
    ? startSpotlightSync({
        native: KaihumanShared,
        refresh: async () => {
          await refreshSearchIndex();
          return searchIndex.docs();
        },
        onChange: (listener) => githubFileStore.openFiles.subscribe(listener),
      })
    : () => undefined;
  setAppIntelligence(nativeIntelligence());
  const shared = KaihumanShared;
  const stopDrain = shared
    ? startSmartCaptureDrain({
        store: {
          read: (n) => shared.readSharedFile(n),
          write: (n, c) => shared.writeSharedFile(n, c),
        },
        onTree: (listener) => githubFileStore.tree.subscribe((tree) => listener(tree.length > 0)),
        save: (capture) =>
          saveCapture(capture, {
            controller: new QuickCaptureController(),
            files: githubCaptureFiles,
          }),
      })
    : () => undefined;
  active = () => {
    stopDrain();
    stopSpotlight();
    stopSync();
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
