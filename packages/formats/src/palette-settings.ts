/**
 * The command palettes' settings (`.kh/command-palette.settings.json`): which web search engines
 * the palette offers for anything typed, and the link tools behind a prefix — `>l` for logs, say.
 *
 * Both are links built from what is typed, so neither needs code: `{query}` in a URL or a parameter
 * value is replaced by the text. The order in the file is the order in the palette, and the first
 * engine is the one ⏎ searches when nothing else matches.
 */

/** Where the palettes read their settings from, in every repository. */
export const PALETTE_SETTINGS_PATH = '.kh/command-palette.settings.json';

/** Replaced by what is typed, in a URL or a parameter value. */
export const QUERY_PLACEHOLDER = '{query}';

/** One query parameter added to a link, in order, after any the URL already has. */
export interface LinkParam {
  key: string;
  /** May hold `{query}`. */
  value: string;
  /**
   * Used instead of `value` when nothing is typed — for a value that only makes sense with a term,
   * like Tsuga's `… AND "{query}"`. Without it, `{query}` simply becomes empty.
   */
  empty?: string;
}

export interface SearchEngineSetting {
  name: string;
  /** The results page, with `{query}` where the search goes. */
  url: string;
  params: LinkParam[];
}

/** A link behind a prefix: typing `>l term` offers the link built from `term`. */
export interface PaletteToolSetting {
  /** Typed after `>`; letters and digits only. */
  prefix: string;
  name: string;
  /** What the help (`?`) says about it. */
  description?: string;
  url: string;
  params: LinkParam[];
}

export interface CommandPaletteSettings {
  searchEngines: SearchEngineSetting[];
  tools: PaletteToolSetting[];
}

/** Prefixes the palettes' own modes claim; a tool cannot take one of them. */
export const BUILT_IN_PALETTE_PREFIXES: readonly string[] = [
  'b',
  'p',
  't',
  'r',
  'g',
  'f',
  'x',
  'd',
  'c',
  'u',
];

const TSUGA_TEAM_QUERY = 'context.cloud.camunda.io/owner-team:console';

/** What the palettes offer with no settings file — the engines and tools they always had. */
export const DEFAULT_PALETTE_SETTINGS: CommandPaletteSettings = {
  searchEngines: [
    { name: 'Google', url: 'https://www.google.com/search?q={query}', params: [] },
    { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}', params: [] },
    { name: 'Ecosia', url: 'https://www.ecosia.org/search?q={query}', params: [] },
    { name: 'Amazon', url: 'https://www.amazon.com/s?k={query}', params: [] },
    { name: 'Amazon.de', url: 'https://www.amazon.de/s?k={query}', params: [] },
    { name: 'Reddit', url: 'https://www.reddit.com/search/?q={query}', params: [] },
  ],
  tools: [
    {
      prefix: 'l',
      name: 'Tsuga logs',
      description: 'The console team’s logs in Tsuga’s explorer, filtered by what is typed',
      url: 'https://app.tsuga.com/explorer',
      params: [
        {
          key: 'query',
          value: `${TSUGA_TEAM_QUERY} AND "{query}"`,
          // Tsuga's own link for the team ends its query in a space; kept, so both match exactly.
          empty: `${TSUGA_TEAM_QUERY} `,
        },
        { key: 'extraColumns', value: JSON.stringify(['file', 'fn', 'service']) },
        { key: 'clusterIds', value: '8v5j-x2k0n-dzk4' },
      ],
    },
  ],
};

/** The text as a form would submit it — `rust book` → `rust+book`. */
const encodeQuery = (query: string) => new URLSearchParams([['', query]]).toString().slice(1);

/** The link for `query` (trimmed): `{query}` filled in everywhere, the parameters appended. */
export const buildLinkUrl = (link: Pick<SearchEngineSetting, 'url' | 'params'>, query: string) => {
  const term = query.trim();
  const url = link.url.replaceAll(QUERY_PLACEHOLDER, encodeQuery(term));
  if (!link.params.length) return url;
  const params = new URLSearchParams(
    link.params.map((param): [string, string] => [
      param.key,
      !term && param.empty !== undefined
        ? param.empty
        : param.value.replaceAll(QUERY_PLACEHOLDER, term),
    ]),
  );
  return `${url}${url.includes('?') ? '&' : '?'}${params}`;
};

const isWebUrl = (template: string) => {
  try {
    const { protocol } = new URL(template.replaceAll(QUERY_PLACEHOLDER, 'x'));
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const PREFIX_PATTERN = /^[a-z0-9]+$/;

/** Why an engine cannot be used, or null when it can. */
export const searchEngineProblem = (engine: SearchEngineSetting): string | null => {
  if (!engine.name.trim()) return 'A search engine needs a name';
  if (!isWebUrl(engine.url)) return `${engine.name}: the URL must start with https:// or http://`;
  if (engine.params.some((param) => !param.key.trim()))
    return `${engine.name}: a parameter has no name`;
  return null;
};

/** Why a tool cannot be used — `others` are the tools listed before it — or null when it can. */
export const toolProblem = (
  tool: PaletteToolSetting,
  others: readonly PaletteToolSetting[] = [],
): string | null => {
  const label = tool.name.trim() || `>${tool.prefix}`;
  if (!tool.name.trim()) return `>${tool.prefix}: a tool needs a name`;
  if (!PREFIX_PATTERN.test(tool.prefix)) {
    return `${label}: the prefix must be lowercase letters or digits`;
  }
  if (BUILT_IN_PALETTE_PREFIXES.includes(tool.prefix)) {
    return `${label}: >${tool.prefix} is one of the palette’s own prefixes`;
  }
  if (others.some((other) => other.prefix === tool.prefix)) {
    return `${label}: >${tool.prefix} is already taken by a tool above`;
  }
  if (!isWebUrl(tool.url)) return `${label}: the URL must start with https:// or http://`;
  if (tool.params.some((param) => !param.key.trim())) return `${label}: a parameter has no name`;
  return null;
};

/** Every reason an entry will be left out, in file order — for the widget to show. */
export const paletteSettingsProblems = (settings: CommandPaletteSettings): string[] =>
  [
    ...settings.searchEngines.map(searchEngineProblem),
    ...settings.tools.map((tool, index) => toolProblem(tool, settings.tools.slice(0, index))),
  ].filter((problem): problem is string => problem !== null);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const readParams = (value: unknown): LinkParam[] =>
  Array.isArray(value)
    ? value
        .filter((param) => param && typeof param === 'object')
        .map((param) => ({
          key: text(param.key),
          value: text(param.value),
          ...(typeof param.empty === 'string' ? { empty: param.empty } : {}),
        }))
    : [];

/**
 * The settings as written, every entry kept — the widget edits them as they are. A list the file
 * does not have is the default one; an empty list stays empty. `error` is set, and the defaults
 * returned, when the file is not valid JSON.
 */
export const readPaletteSettings = (
  content: string | null | undefined,
): { settings: CommandPaletteSettings; error?: string } => {
  if (!content?.trim()) return { settings: structuredClone(DEFAULT_PALETTE_SETTINGS) };
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(content);
    parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {
      settings: structuredClone(DEFAULT_PALETTE_SETTINGS),
      error: 'The settings file is not valid JSON',
    };
  }
  const list = (key: string) =>
    Array.isArray(parsed[key])
      ? (parsed[key] as unknown[]).filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === 'object'),
        )
      : null;
  const engines = list('searchEngines');
  const tools = list('tools');
  return {
    settings: {
      searchEngines: engines
        ? engines.map((engine) => ({
            name: text(engine.name),
            url: text(engine.url),
            params: readParams(engine.params),
          }))
        : structuredClone(DEFAULT_PALETTE_SETTINGS.searchEngines),
      tools: tools
        ? tools.map((tool) => ({
            prefix: text(tool.prefix),
            name: text(tool.name),
            ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
            url: text(tool.url),
            params: readParams(tool.params),
          }))
        : structuredClone(DEFAULT_PALETTE_SETTINGS.tools),
    },
  };
};

/** What the palettes use: the file's settings without the entries they cannot use. */
export const usablePaletteSettings = (
  content: string | null | undefined,
): CommandPaletteSettings => {
  const { settings, error } = readPaletteSettings(content);
  if (error) console.warn(`[palette-settings] ${error}; using the defaults`);
  return {
    searchEngines: settings.searchEngines.filter((engine) => !searchEngineProblem(engine)),
    tools: settings.tools.filter(
      (tool, index) => !toolProblem(tool, settings.tools.slice(0, index)),
    ),
  };
};

export const serializePaletteSettings = (settings: CommandPaletteSettings): string =>
  `${JSON.stringify(settings, null, 2)}\n`;
