import { Logger } from '@lifosy/core';
export interface RssConfig {
  feedOptions: RssFeedConfig[];
  readLater: string[]; // List of URLs or IDs? Requirements say "skip this for now" but field exists.
}

export interface RssFeedConfig {
  id: string;
  url: string;
  xml?: string; // Optional cache?
  read: string[]; // List of read item GUIDs or URLs
}

export interface RssItem {
  title: string;
  link: string;
  guid: string;
  description?: string;
  pubDate?: string;
  comments?: string; // Link to comments
}

// Default empty config
export const DEFAULT_RSS_CONFIG: RssConfig = {
  feedOptions: [],
  readLater: []
};

const logger = new Logger('RssLogic');

export const parseRssConfig = (content: string): RssConfig => {
  try {
    const parsed = JSON.parse(content);
    // Basic validation could go here
    return {
      feedOptions: Array.isArray(parsed.feedOptions) ? parsed.feedOptions : [],
      readLater: Array.isArray(parsed.readLater) ? parsed.readLater : []
    };
  } catch (e) {
    logger.warn("Failed to parse RSS config, returning default", e);
    return DEFAULT_RSS_CONFIG;
  }
};

export const serializeRssConfig = (config: RssConfig): string => {
  return JSON.stringify(config, null, 2);
};

export const markItemAsRead = (config: RssConfig, feedId: string, itemLink: string): RssConfig => {
  const feedIndex = config.feedOptions.findIndex(f => f.id === feedId);
  if (feedIndex === -1) return config;

  const feed = config.feedOptions[feedIndex];
  if (!feed) return config;

  if (feed.read.includes(itemLink)) return config;

  const newFeed: RssFeedConfig = { ...feed, read: [...feed.read, itemLink] };
  const newOptions = [...config.feedOptions];
  newOptions[feedIndex] = newFeed;

  return { ...config, feedOptions: newOptions };
};

export const addFeed = (config: RssConfig, url: string): RssConfig => {
  const newFeed: RssFeedConfig = {
    id: crypto.randomUUID(),
    url,
    read: [],
    xml: ""
  };
  return { ...config, feedOptions: [...config.feedOptions, newFeed] };
};

export const removeFeed = (config: RssConfig, feedId: string): RssConfig => {
  return { ...config, feedOptions: config.feedOptions.filter(f => f.id !== feedId) };
};

// fetching logic
const PROXY_BASE = "https://fly.urbanisierung.dev/proxy/domain?feed=";

export const fetchFeedXml = async (feedUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(`${PROXY_BASE}${encodeURIComponent(feedUrl)}`);
    if (!response.ok) return null;
    return await response.text();
  } catch (e) {
    logger.error(`Failed to fetch feed: ${feedUrl}`, e);
    return null;
  }
};

export const parseFeedItems = (xmlString: string): RssItem[] => {
  if (!xmlString) return [];
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const items = Array.from(xmlDoc.querySelectorAll("item"));

    return items.map(item => {
      const title = item.querySelector("title")?.textContent || "No Title";
      const link = item.querySelector("link")?.textContent || "";
      const guid = item.querySelector("guid")?.textContent || link;
      const description = item.querySelector("description")?.textContent || "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";
      const comments = item.querySelector("comments")?.textContent || "";

      return {
        title,
        link,
        guid,
        description,
        pubDate,
        comments
      };
    });
  } catch (e) {
    logger.error("Error parsing XML", e);
    return [];
  }
};
