// Imported first by the app entry (index.ts). Anything that imports the `@kaihuman/core` root
// constructs its stores, which read storage at that moment, so this module must not.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createExpoCacheFs } from '../sync/expo-cache-fs.js';
import { secureOptions } from './secure-options.js';
import { bootStorage } from './storage-boot.js';

bootStorage({
  platform: Platform.OS,
  dev: __DEV__,
  fs: Platform.OS === 'web' ? null : createExpoCacheFs(),
  secure: {
    getItem: (key) => SecureStore.getItem(key, secureOptions),
    setItem: (key, value) => SecureStore.setItem(key, value, secureOptions),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, secureOptions),
  },
});
