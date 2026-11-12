import { authStore, demoMode } from '@kaihuman/core';
import { effect, signal } from '@preact/signals';

export const SECURE_TOKEN_KEY = 'github-token';

/** False until the Keychain token has been read; routing waits for it instead of showing login. */
export const tokenHydrated = signal(false);

export interface SecureTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
}

export interface TokenSyncDeps {
  secure: SecureTokenStore;
  shared: { setSharedToken(token: string | null): void } | null;
  auth?: { token: { value: string | null } };
  /**
   * False while the app runs in the background. A failed Keychain read there (locked phone)
   * decides nothing: hydration waits for `retry()` on the next foreground.
   */
  foreground?: () => boolean;
  /** Re-reads core's own persisted session (token, refresh token) after a failed read. */
  restore?: () => Promise<unknown>;
}

export type TokenSync = (() => void) & {
  ready: Promise<void>;
  /** Reads the Keychain again when an earlier read failed; call it when the app comes to the foreground. */
  retry(): Promise<void>;
};

/**
 * Mirrors the auth token to the Keychain/Keystore and the widgets' shared copy, and restores
 * it from the Keychain when core's own storage came up empty. Demo tokens are never mirrored.
 * Core keeps owning persistence of `lifeos_gh_token`; this only adds the native copies.
 */
export function startTokenSync(deps: TokenSyncDeps): TokenSync {
  const auth = deps.auth ?? authStore;
  const foreground = deps.foreground ?? (() => true);
  let disposed = false;
  // Until hydration finishes an empty token must not wipe the Keychain copy we are about to read.
  let hydrated = false;
  let pending: Promise<void> | null = null;

  const hydrate = (again: boolean): Promise<void> =>
    deps.secure.get().then(
      (stored) => settle(stored, true, again),
      () => settle(null, false, again),
    );

  const settle = async (stored: string | null, ok: boolean, again: boolean) => {
    if (disposed || hydrated) return;
    // A locked phone in the background: routing now would show the login screen on next open.
    if (!ok && !auth.token.value && !foreground()) return;
    // Core read the same locked Keychain at launch, so its session (and refresh token) is missing too.
    if (again && deps.restore) await deps.restore().catch(() => undefined);
    if (disposed || hydrated) return;
    if (stored && !auth.token.value) auth.token.value = stored;
    hydrated = true;
    tokenHydrated.value = true;
    // A failed read (locked device) is not an empty Keychain: pushing null would delete the token.
    if (!ok && !auth.token.value) return;
    push(auth.token.value);
  };

  const ready = hydrate(false);

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
    {
      ready,
      retry(): Promise<void> {
        if (hydrated || disposed) return Promise.resolve();
        pending ??= hydrate(true).finally(() => {
          pending = null;
        });
        return pending;
      },
    },
  );
}
