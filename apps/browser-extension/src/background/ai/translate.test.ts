import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateOnDevice } from './translate';

const stub = (detected: string, state = 'available') => {
  const create = vi.fn(async (o: { sourceLanguage: string; targetLanguage: string }) => ({
    translate: async (t: string) => `${o.sourceLanguage}>${o.targetLanguage}:${t}`,
    destroy: () => {},
  }));
  vi.stubGlobal('Translator', { availability: vi.fn(async () => state), create });
  vi.stubGlobal('LanguageDetector', {
    availability: async () => 'available',
    create: async () => ({
      detect: async () => [{ detectedLanguage: detected, confidence: 0.9 }],
      destroy: () => {},
    }),
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('translateOnDevice', () => {
  it('maps DeepL codes and upper-cases the detected source', async () => {
    stub('de');
    expect(await translateOnDevice('Hallo', ['EN-US'])).toEqual([
      { target: 'EN-US', text: 'de>en:Hallo', detectedSource: 'DE' },
    ]);
  });

  it('keeps text already in the target language', async () => {
    stub('en');
    expect(await translateOnDevice('Hi', ['EN-US', 'DE'])).toEqual([
      { target: 'EN-US', text: 'Hi', detectedSource: 'EN' },
      { target: 'DE', text: 'en>de:Hi', detectedSource: 'EN' },
    ]);
  });

  it('explains a missing language pack', async () => {
    stub('de', 'downloadable');
    await expect(translateOnDevice('Hallo', ['EN-US'])).rejects.toThrow(/language pack/);
  });
});
