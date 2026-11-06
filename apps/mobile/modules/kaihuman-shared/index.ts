import { requireOptionalNativeModule } from 'expo-modules-core';

/** Native bridge to the App Group (iOS) / `kaihuman_widget` SharedPreferences (Android). */
export interface KaihumanSharedModule {
  readSharedFile(name: string): string | null;
  writeSharedFile(name: string, content: string): void;
  reloadWidgets(): void;
  setSharedToken(token: string | null): void;
  /** Returns and removes the URL a widget intent stored in `pending-url`. */
  consumePendingUrl(): string | null;
  // iOS Live Activity / Android ongoing notification; feature-check each call (absent where the native module is not linked).
  /** Starts a focus Live Activity (iOS) or ongoing notification (Android) for a todo; returns its activity id, or null when refused (e.g. notifications not permitted). */
  startFocusActivity?(todoId: string, todoText: string, minutes: number): string | null;
  /** Moves the end of a running focus activity (e.g. to extend or shorten the timer). */
  updateFocusActivity?(activityId: string, plannedEndMs: number): void;
  endFocusActivity?(activityId: string): void;
}

/** Null where the native module is not linked (tests, web, Expo Go). */
export const KaihumanShared = requireOptionalNativeModule<KaihumanSharedModule>('KaihumanShared');
