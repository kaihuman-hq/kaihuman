import { Logger } from '@kaihuman/core';
import {
  addRssFeed,
  markRssItemRead,
  parseFeedXml,
  type RssConfig,
  type RssItem,
  removeRssFeed,
} from '@kaihuman/formats';

export type { RssConfig, RssFeedConfig, RssItem } from '@kaihuman/formats';
export { DEFAULT_RSS_CONFIG, parseRssConfig, serializeRssConfig } from '@kaihuman/formats';

const logger = new Logger('RssLogic');

export const markItemAsRead = (config: RssConfig, feedId: string, itemLink: string): RssConfig =>
  markRssItemRead(config, feedId, itemLink);

export const addFeed = (config: RssConfig, url: string): RssConfig =>
  addRssFeed(config, url, crypto.randomUUID());

export const removeFeed = (config: RssConfig, feedId: string): RssConfig =>
  removeRssFeed(config, feedId);

const PROXY_BASE = 'https://fly.urbanisierung.dev/proxy/domain?feed=';

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

export const parseFeedItems = (xmlString: string): RssItem[] => parseFeedXml(xmlString).items;
