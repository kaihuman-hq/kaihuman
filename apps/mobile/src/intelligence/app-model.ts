import type { LanguageModel } from './model.js';

/**
 * The app's Apple Intelligence bridge, set by `bootstrap` from the native module. Views read it here
 * so they never import `expo-modules-core` (which cannot load in the render tests).
 */
export interface AppIntelligence {
  model: LanguageModel | null;
  /** Vision OCR of an image file, or (null) of the document camera; null when cancelled. */
  recognizeDocument(uri: string | null): Promise<string | null>;
}

let current: AppIntelligence = { model: null, recognizeDocument: async () => null };

export const appIntelligence = (): AppIntelligence => current;
export const setAppIntelligence = (next: AppIntelligence): void => {
  current = next;
};
