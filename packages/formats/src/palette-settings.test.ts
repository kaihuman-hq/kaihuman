import { describe, expect, it, vi } from 'vitest';
import {
  buildLinkUrl,
  DEFAULT_PALETTE_SETTINGS,
  type PaletteToolSetting,
  paletteSettingsProblems,
  readPaletteSettings,
  serializePaletteSettings,
  usablePaletteSettings,
} from './palette-settings.js';

const engine = (name: string) => {
  const found = DEFAULT_PALETTE_SETTINGS.searchEngines.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No engine ${name}`);
  return found;
};

const tool = (over: Partial<PaletteToolSetting> = {}): PaletteToolSetting => ({
  prefix: 'k',
  name: 'Kibana',
  url: 'https://kibana.example.com/app?q={query}',
  params: [],
  ...over,
});

describe('buildLinkUrl', () => {
  it('builds the default engines’ results pages as the palette always has', () => {
    const url = (name: string) => buildLinkUrl(engine(name), 'rust book');
    expect(url('Google')).toBe('https://www.google.com/search?q=rust+book');
    expect(url('DuckDuckGo')).toBe('https://duckduckgo.com/?q=rust+book');
    expect(url('Ecosia')).toBe('https://www.ecosia.org/search?q=rust+book');
    expect(url('Amazon')).toBe('https://www.amazon.com/s?k=rust+book');
    expect(url('Amazon.de')).toBe('https://www.amazon.de/s?k=rust+book');
    expect(url('Reddit')).toBe('https://www.reddit.com/search/?q=rust+book');
  });

  it('encodes characters that would otherwise change the url', () => {
    const url = new URL(buildLinkUrl(engine('Google'), 'a&b=c #d?'));
    expect(url.searchParams.get('q')).toBe('a&b=c #d?');
    expect(url.hash).toBe('');
  });

  it('builds exactly the Tsuga links the team uses', () => {
    const [tsuga] = DEFAULT_PALETTE_SETTINGS.tools;
    if (!tsuga) throw new Error('No Tsuga tool');
    expect(buildLinkUrl(tsuga, '')).toBe(
      'https://app.tsuga.com/explorer?query=context.cloud.camunda.io%2Fowner-team%3Aconsole+&extraColumns=%5B%22file%22%2C%22fn%22%2C%22service%22%5D&clusterIds=8v5j-x2k0n-dzk4',
    );
    expect(buildLinkUrl(tsuga, ' search term ')).toBe(
      'https://app.tsuga.com/explorer?query=context.cloud.camunda.io%2Fowner-team%3Aconsole+AND+%22search+term%22&extraColumns=%5B%22file%22%2C%22fn%22%2C%22service%22%5D&clusterIds=8v5j-x2k0n-dzk4',
    );
  });

  it('adds parameters after those the URL already has', () => {
    expect(
      buildLinkUrl(
        { url: 'https://x.test/s?lang=de', params: [{ key: 'q', value: '{query}!' }] },
        'a b',
      ),
    ).toBe('https://x.test/s?lang=de&q=a+b%21');
  });
});

describe('readPaletteSettings', () => {
  it('reads no file, or an empty one, as the defaults', () => {
    expect(readPaletteSettings(undefined).settings).toEqual(DEFAULT_PALETTE_SETTINGS);
    expect(readPaletteSettings('  ').settings).toEqual(DEFAULT_PALETTE_SETTINGS);
  });

  it('keeps a list the file empties empty, and defaults one it leaves out', () => {
    const { settings } = readPaletteSettings('{"searchEngines": []}');
    expect(settings.searchEngines).toEqual([]);
    expect(settings.tools).toEqual(DEFAULT_PALETTE_SETTINGS.tools);
  });

  it('says so when the file is not JSON', () => {
    expect(readPaletteSettings('{nope').error).toBe('The settings file is not valid JSON');
  });

  it('reads back what it wrote, in order', () => {
    const settings = {
      searchEngines: [...DEFAULT_PALETTE_SETTINGS.searchEngines].reverse(),
      tools: [tool({ description: 'Logs', params: [{ key: 'a', value: 'b', empty: '' }] })],
    };
    expect(readPaletteSettings(serializePaletteSettings(settings)).settings).toEqual(settings);
  });

  it('does not share the defaults with its caller', () => {
    readPaletteSettings('').settings.searchEngines.pop();
    expect(DEFAULT_PALETTE_SETTINGS.searchEngines).toHaveLength(6);
  });
});

describe('usablePaletteSettings', () => {
  it('leaves out what the palette cannot use', () => {
    const settings = usablePaletteSettings(
      JSON.stringify({
        searchEngines: [
          { name: 'Ok', url: 'https://ok.test/?q={query}' },
          { name: 'Script', url: 'javascript:alert(1)' },
          { name: '', url: 'https://x.test' },
        ],
        tools: [
          tool(),
          tool({ name: 'Taken', prefix: 'p' }),
          tool({ name: 'Twice' }),
          tool({ name: 'Spaced', prefix: 'a b' }),
          tool({ name: 'Unnamed param', prefix: 'z', params: [{ key: '', value: 'x' }] }),
        ],
      }),
    );
    expect(settings.searchEngines.map((e) => e.name)).toEqual(['Ok']);
    expect(settings.tools.map((t) => t.name)).toEqual(['Kibana']);
  });

  it('falls back to the defaults on a broken file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(usablePaletteSettings('{nope')).toEqual(DEFAULT_PALETTE_SETTINGS);
    warn.mockRestore();
  });
});

describe('paletteSettingsProblems', () => {
  it('has none for the defaults', () => {
    expect(paletteSettingsProblems(DEFAULT_PALETTE_SETTINGS)).toEqual([]);
  });

  it('names each entry that will be left out, and why', () => {
    expect(
      paletteSettingsProblems({
        searchEngines: [{ name: 'Bad', url: 'ftp://x', params: [] }],
        tools: [tool(), tool({ name: 'Again' }), tool({ name: 'Own', prefix: 't' })],
      }),
    ).toEqual([
      'Bad: the URL must start with https:// or http://',
      'Again: >k is already taken by a tool above',
      'Own: >t is one of the palette’s own prefixes',
    ]);
  });
});
