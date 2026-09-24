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
    expect(url('Bing')).toBe('https://www.bing.com/search?q=rust+book');
    expect(url('Brave Search')).toBe('https://search.brave.com/search?q=rust+book');
    expect(url('Startpage')).toBe('https://www.startpage.com/do/search?q=rust+book');
    expect(url('Wikipedia')).toBe('https://en.wikipedia.org/w/index.php?search=rust+book');
    expect(url('YouTube')).toBe('https://www.youtube.com/results?search_query=rust+book');
    expect(url('GitHub')).toBe('https://github.com/search?q=rust+book');
    expect(url('Stack Overflow')).toBe('https://stackoverflow.com/search?q=rust+book');
    expect(url('Yahoo')).toBe('https://search.yahoo.com/search?p=rust+book');
    expect(url('Qwant')).toBe('https://www.qwant.com/?q=rust+book');
  });

  it('encodes characters that would otherwise change the url', () => {
    const url = new URL(buildLinkUrl(engine('Google'), 'a&b=c #d?'));
    expect(url.searchParams.get('q')).toBe('a&b=c #d?');
    expect(url.hash).toBe('');
  });

  it('builds the default Tsuga link from what is typed alone', () => {
    const [tsuga] = DEFAULT_PALETTE_SETTINGS.tools;
    if (!tsuga) throw new Error('No Tsuga tool');
    expect(buildLinkUrl(tsuga, '')).toBe('https://app.tsuga.com/explorer?query=');
    expect(buildLinkUrl(tsuga, ' search term ')).toBe(
      'https://app.tsuga.com/explorer?query=search+term',
    );
  });

  it('asks the default assistants the question', () => {
    const ask = (name: string) => {
      const assistant = DEFAULT_PALETTE_SETTINGS.assistants.find((a) => a.name === name);
      if (!assistant) throw new Error(`No assistant ${name}`);
      return buildLinkUrl(assistant, 'why is the sky blue?');
    };
    expect(ask('ChatGPT')).toBe('https://chatgpt.com/?q=why+is+the+sky+blue%3F');
    expect(ask('Claude')).toBe('https://claude.ai/new?q=why+is+the+sky+blue%3F');
    expect(ask('Gemini')).toBe('https://gemini.google.com/app?q=why+is+the+sky+blue%3F');
    expect(ask('GitHub Copilot')).toBe('https://github.com/copilot?q=why+is+the+sky+blue%3F');
    expect(ask('Perplexity')).toBe('https://www.perplexity.ai/search?q=why+is+the+sky+blue%3F');
  });

  it('puts the term in a path with %20, since a + there is a plus', () => {
    const leo = DEFAULT_PALETTE_SETTINGS.tools.find((candidate) => candidate.prefix === 'e');
    if (!leo) throw new Error('No LEO tool');
    expect(buildLinkUrl(leo, 'guten Morgen')).toBe(
      'https://dict.leo.org/german-english/guten%20Morgen',
    );
    expect(buildLinkUrl({ url: 'https://x.test/{query}/?q={query}', params: [] }, 'a+b c')).toBe(
      'https://x.test/a%2Bb%20c/?q=a%2Bb+c',
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
    expect(settings.assistants).toEqual(DEFAULT_PALETTE_SETTINGS.assistants);
    expect(settings.tools).toEqual(DEFAULT_PALETTE_SETTINGS.tools);
  });

  it('says so when the file is not JSON', () => {
    expect(readPaletteSettings('{nope').error).toBe('The settings file is not valid JSON');
  });

  it('reads back what it wrote, in order', () => {
    const settings = {
      searchEngines: [...DEFAULT_PALETTE_SETTINGS.searchEngines].reverse(),
      assistants: [{ name: 'Ask', url: 'https://ask.test/?q={query}', params: [] }],
      tools: [tool({ description: 'Logs', params: [{ key: 'a', value: 'b', empty: '' }] })],
    };
    expect(readPaletteSettings(serializePaletteSettings(settings)).settings).toEqual(settings);
  });

  it('does not share the defaults with its caller', () => {
    readPaletteSettings('').settings.searchEngines.pop();
    expect(DEFAULT_PALETTE_SETTINGS.searchEngines).toHaveLength(15);
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
        assistants: [
          { name: 'Ask', url: 'https://ask.test/?q={query}' },
          { name: 'Local', url: 'file:///ask' },
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
    expect(settings.assistants.map((a) => a.name)).toEqual(['Ask']);
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
        assistants: [{ name: '', url: 'https://ask.test/?q={query}', params: [] }],
        tools: [tool(), tool({ name: 'Again' }), tool({ name: 'Own', prefix: 't' })],
      }),
    ).toEqual([
      'Bad: the URL must start with https:// or http://',
      'An assistant needs a name',
      'Again: >k is already taken by a tool above',
      'Own: >t is one of the palette’s own prefixes',
    ]);
  });
});
