export interface RssFeedConfig {
  id: string;
  url: string;
  xml?: string;
  /** Item keys (guid, else link) already read. */
  read: string[];
}

export interface RssConfig {
  feedOptions: RssFeedConfig[];
  readLater: string[];
}

export interface RssItem {
  title: string;
  link: string;
  guid: string;
  description?: string;
  pubDate?: string;
  /** Link to the comments page. */
  comments?: string;
}

export const DEFAULT_RSS_CONFIG: RssConfig = { feedOptions: [], readLater: [] };

export const parseRssConfig = (content: string): RssConfig => {
  if (!content || !content.trim()) return DEFAULT_RSS_CONFIG;
  try {
    const parsed = JSON.parse(content);
    return {
      feedOptions: Array.isArray(parsed?.feedOptions) ? parsed.feedOptions : [],
      readLater: Array.isArray(parsed?.readLater) ? parsed.readLater : [],
    };
  } catch {
    return DEFAULT_RSS_CONFIG;
  }
};

export const serializeRssConfig = (config: RssConfig): string => JSON.stringify(config, null, 2);

export const markRssItemRead = (config: RssConfig, feedId: string, key: string): RssConfig => {
  const index = config.feedOptions.findIndex((f) => f.id === feedId);
  const feed = config.feedOptions[index];
  if (!feed || feed.read.includes(key)) return config;
  const feedOptions = [...config.feedOptions];
  feedOptions[index] = { ...feed, read: [...feed.read, key] };
  return { ...config, feedOptions };
};

/** The id is injected so callers (and tests) stay deterministic. */
export const addRssFeed = (config: RssConfig, url: string, id: string): RssConfig => ({
  ...config,
  feedOptions: [...config.feedOptions, { id, url, read: [], xml: '' }],
});

export const removeRssFeed = (config: RssConfig, feedId: string): RssConfig => ({
  ...config,
  feedOptions: config.feedOptions.filter((f) => f.id !== feedId),
});

// ─── Feed XML (RSS 2.0 and Atom), DOM-free so it runs in React Native ───────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (text: string): string =>
  text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (whole, dec, hex, name) => {
    if (dec || hex) {
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** CDATA is literal; only text outside it carries entities. */
const decodeText = (raw: string): string => {
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeEntities(raw.slice(last, m.index));
    out += m[1];
    last = (m.index ?? 0) + m[0].length;
  }
  return (out + decodeEntities(raw.slice(last))).trim();
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tagText = (block: string, name: string): string => {
  const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i');
  const m = re.exec(block);
  return m?.[1] === undefined ? '' : decodeText(m[1]);
};

const attr = (tag: string, name: string): string => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return decodeEntities(m?.[1] ?? m?.[2] ?? '');
};

/** RSS `<link>text</link>`, or an Atom `<link href>` (the alternate one when there are several). */
const linkOf = (block: string): string => {
  const tags = [...block.matchAll(/<link(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/link>)/gi)];
  const hrefs = tags.map((m) => ({ href: attr(m[0], 'href'), rel: attr(m[0], 'rel') }));
  const alt = hrefs.find((h) => h.href && (h.rel === '' || h.rel === 'alternate'));
  if (alt) return alt.href;
  for (const m of tags) {
    const text = m[2] === undefined ? '' : decodeText(m[2]);
    if (text) return text;
  }
  return '';
};

export const parseFeedXml = (xml: string): { title: string; items: RssItem[] } => {
  if (!xml) return { title: '', items: [] };
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
  const head = blocks[0]?.index === undefined ? xml : xml.slice(0, blocks[0].index);
  const items = blocks.map((m): RssItem => {
    const block = m[2] ?? '';
    const link = linkOf(block);
    return {
      title: tagText(block, 'title') || 'No Title',
      link,
      guid: tagText(block, 'guid') || tagText(block, 'id') || link,
      description: tagText(block, 'description') || tagText(block, 'summary'),
      pubDate:
        tagText(block, 'pubDate') || tagText(block, 'updated') || tagText(block, 'published'),
      comments: tagText(block, 'comments'),
    };
  });
  return { title: tagText(head, 'title'), items };
};
