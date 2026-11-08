import { authStore, demoMode } from '@kaihuman/core';
import { effect } from '@preact/signals';

export const SECURE_TOKEN_KEY = 'github-token';
export const KEYCHAIN_SERVICE = 'com.kaihuman.app';

export interface SecureTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
}

export interface TokenSyncDeps {
  secure: SecureTokenStore;
  shared: { setSharedToken(token: string | null): void } | null;
  auth?: { token: { value: string | null } };
}

/**
 * Mirrors the auth token to the Keychain/Keystore and the widgets' shared copy, and restores
 * it from the Keychain when core's own storage came up empty. Demo tokens are never mirrored.
 * Core keeps owning persistence of `lifeos_gh_token`; this only adds the native copies.
 */
export function startTokenSync(deps: TokenSyncDeps): (() => void) & { ready: Promise<void> } {
  const auth = deps.auth ?? authStore;
  let disposed = false;
  // Until hydration finishes an empty token must not wipe the Keychain copy we are about to read.
  let hydrated = false;

  const ready = deps.secure
    .get()
    .catch(() => null)
    .then((stored) => {
      if (disposed) return;
      if (stored && !auth.token.value) auth.token.value = stored;
      hydrated = true;
      push(auth.token.value);
    });

  const push = (token: string | null) => {
    if (!hydrated) return;
    const value = demoMode.value ? null : token;
    if (value) {
      void deps.secure.set(value).catch(() => undefined);
      deps.shared?.setSharedToken(value);
    } else {
      void deps.secure.remove().catch(() => undefined);
      deps.shared?.setSharedToken(null);
    }
  };

  const stop = effect(() => {
    push(auth.token.value);
    demoMode.value;
  });
  return Object.assign(
    () => {
      disposed = true;
      stop();
    },
    { ready },
  );
}
