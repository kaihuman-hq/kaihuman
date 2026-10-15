import type { Translation } from '@kaihuman/palette';
import { detectLanguage, translate } from './model.js';

export const MISSING_PACK =
  'On-device translation needs the language pack: download it in the side panel settings, or set a DeepL key.';

// DeepL's codes in, Chrome's BCP-47 bases out.
const base = (code: string) => code.split('-')[0]?.toLowerCase() ?? '';

/** Translates with Chrome's Translator, for when there is no DeepL key or DeepL cannot be reached. */
export async function translateOnDevice(text: string, targets: string[]): Promise<Translation[]> {
  const source = await detectLanguage(text, { timeoutMs: 30_000 });
  if (!source) throw new Error(MISSING_PACK);
  const out: Translation[] = [];
  for (const target of targets) {
    const to = base(target);
    // Already in that language: nothing to translate, and `usefulTranslations` drops it.
    const translated =
      to === source ? text : await translate(text, source, to, { timeoutMs: 30_000 });
    if (!translated) throw new Error(MISSING_PACK);
    out.push({ target, text: translated, detectedSource: source.toUpperCase() });
  }
  return out;
}
