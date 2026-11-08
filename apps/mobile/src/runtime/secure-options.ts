import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Must match the widgets' keychain service, which is the iOS bundle id (see the widgets plugin).
// expo-constants' typings resolve the default import to the module namespace here (see app/login.tsx).
export const KEYCHAIN_SERVICE = 'com.kaihuman.app';

const expoConfig = (Constants as { expoConfig?: { ios?: { bundleIdentifier?: string } } | null })
  .expoConfig;

/**
 * AFTER_FIRST_UNLOCK: the background sync task and a launch right after a reboot must read the
 * token while the screen is locked; the default (WHEN_UNLOCKED) fails there.
 */
export const secureOptions: SecureStore.SecureStoreOptions = {
  keychainService: expoConfig?.ios?.bundleIdentifier ?? KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};
