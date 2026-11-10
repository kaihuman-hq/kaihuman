import { requireOptionalNativeModule } from 'expo-modules-core';

/** `device`: the on-device Foundation Models model. `server`: Private Cloud Compute (iOS 27+). */
export type ModelTarget = 'device' | 'server';

/**
 * Generic bridge to Apple Intelligence and Vision. Prompts, schemas, parsing and fallbacks live in
 * TS (`src/intelligence`); the native side only runs the model and the text recognizer.
 */
export interface KaihumanIntelligenceModule {
  /** `available`, or why not: `device-not-eligible`, `apple-intelligence-not-enabled`, `model-not-ready`, `unsupported-os`, `unknown`. */
  availability(target: ModelTarget): string;
  /** One plain-text response from a fresh session. */
  generateText(prompt: string, instructions: string, target: ModelTarget): Promise<string>;
  /** Guided generation: resolves a JSON string that matches `schemaJson` (a small JSON Schema subset). */
  generateJson(
    prompt: string,
    instructions: string,
    schemaJson: string,
    target: ModelTarget,
  ): Promise<string>;
  /** Text of the image file at `uri`; with null, of pages scanned with the document camera. Null when cancelled. */
  recognizeDocument(uri: string | null): Promise<string | null>;
}

/** Null where the native module is not linked (tests, web, Android, Expo Go). */
export const KaihumanIntelligence =
  requireOptionalNativeModule<KaihumanIntelligenceModule>('KaihumanIntelligence');
