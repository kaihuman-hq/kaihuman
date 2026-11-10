import { KaihumanIntelligence } from '../../modules/kaihuman-intelligence/index.js';
import type { AppIntelligence } from './app-model.js';
import { nativeModel } from './model.js';

/** Foundation Models and Vision where linked; a null model elsewhere (Android, web, Expo Go). */
export const nativeIntelligence = (): AppIntelligence => ({
  model: nativeModel(KaihumanIntelligence),
  recognizeDocument: (uri) =>
    KaihumanIntelligence ? KaihumanIntelligence.recognizeDocument(uri) : Promise.resolve(null),
});
