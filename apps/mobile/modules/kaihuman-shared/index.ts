import { requireOptionalNativeModule } from 'expo-modules-core';

/** Native bridge to the App Group (iOS) / `kaihuman_widget` SharedPreferences (Android). */
export interface KaihumanSharedModule {
  readSharedFile(name: string): string | null;
  writeSharedFile(name: string, content: string): void;
  reloadWidgets(): void;
  setSharedToken(token: string | null): void;
  /** Returns and removes the URL a widget intent stored in `pending-url`. */
  consumePendingUrl(): string | null;
}

/** Null where the native module is not linked (tests, web, Expo Go). */
export const KaihumanShared = requireOptionalNativeModule<KaihumanSharedModule>('KaihumanShared');
