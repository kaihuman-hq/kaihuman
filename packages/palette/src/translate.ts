/**
 * What the palette's translate mode (`t:`) asks for, and which answers it keeps.
 *
 * Translation is DeepL's: the backend holds the API key and sends one request per target language,
 * so the palette only ever translates on ⏎ — never while typing.
 */

/** Every typed text is offered in these, minus the language it is already in. */
export const TRANSLATION_TARGETS: readonly string[] = ['EN-US', 'DE'];

/**
 * DeepL's target languages. Only these read as a `fr:` prefix, so text that merely starts with a
 * word and a colon ("re: the offer") is translated as it is.
 */
const DEEPL_TARGETS = new Set(
  (
    'AR BG CS DA DE EL EN EN-GB EN-US ES ET FI FR HU ID IT JA KO LT LV NB NL PL PT PT-BR PT-PT ' +
    'RO RU SK SL SV TR UK ZH ZH-HANS ZH-HANT'
  ).split(' '),
);

export interface Translation {
  /** The language asked for, as sent (`EN-US`). */
  target: string;
  text: string;
  /** What DeepL took the text to be written in (`DE`). */
  detectedSource: string;
}

/** `fr: bonjour` asks for French only; anything else goes into every default target. */
export function parseTranslationQuery(query: string): { text: string; targets: string[] } {
  const match = /^([a-z]{2}(?:-[a-z]{2,4})?):\s*(.+)$/is.exec(query.trim());
  const code = match?.[1]?.toUpperCase();
  if (match && code && DEEPL_TARGETS.has(code)) {
    return { text: match[2]?.trim() ?? '', targets: [code] };
  }
  return { text: query.trim(), targets: [...TRANSLATION_TARGETS] };
}

/** `EN-US` and `EN` are both English; DeepL detects sources without the variant. */
const language = (code: string) => code.split('-')[0]?.toUpperCase() ?? '';

/**
 * Drops the translation into the language the text is already in — German text is offered in
 * English, not back in German. If that leaves nothing (one target, asked for outright), it stays.
 */
export function usefulTranslations(translations: Translation[]): Translation[] {
  const useful = translations.filter(
    (translation) => language(translation.target) !== language(translation.detectedSource),
  );
  return useful.length ? useful : translations;
}
