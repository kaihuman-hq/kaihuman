import { describe, expect, it } from 'vitest';
import { parseTranslationQuery, TRANSLATION_TARGETS, usefulTranslations } from './translate.js';

describe('parseTranslationQuery', () => {
  it('sends plain text into every default target', () => {
    expect(parseTranslationQuery('  Guten Morgen ')).toEqual({
      text: 'Guten Morgen',
      targets: [...TRANSLATION_TARGETS],
    });
  });

  it('reads a leading DeepL language code as the only target', () => {
    expect(parseTranslationQuery('fr: good morning')).toEqual({
      text: 'good morning',
      targets: ['FR'],
    });
    expect(parseTranslationQuery('pt-br:bom dia')).toEqual({ text: 'bom dia', targets: ['PT-BR'] });
  });

  it('leaves a word and a colon alone when it is no language', () => {
    expect(parseTranslationQuery('re: the offer').text).toBe('re: the offer');
  });
});

describe('usefulTranslations', () => {
  const into = (target: string, detectedSource: string) => ({
    target,
    text: `${target} text`,
    detectedSource,
  });

  it('drops the translation into the language the text is already in', () => {
    expect(usefulTranslations([into('EN-US', 'DE'), into('DE', 'DE')])).toEqual([
      into('EN-US', 'DE'),
    ]);
  });

  it('keeps a same-language answer when it is all there is', () => {
    expect(usefulTranslations([into('EN-GB', 'EN')])).toEqual([into('EN-GB', 'EN')]);
  });
});
