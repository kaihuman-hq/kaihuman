import { describe, expect, it } from 'vitest';
import {
  addRssFeed,
  markRssItemRead,
  parseFeedXml,
  parseRssConfig,
  removeRssFeed,
  serializeRssConfig,
} from './rss.js';

describe('rss config', () => {
  it('returns defaults for empty and invalid input', () => {
    expect(parseRssConfig('')).toEqual({ feedOptions: [], readLater: [] });
    expect(parseRssConfig('{nope')).toEqual({ feedOptions: [], readLater: [] });
  });
  it('round-trips and mutates immutably', () => {
    let c = addRssFeed(parseRssConfig(''), 'https://a.test/feed', 'f1');
    c = markRssItemRead(c, 'f1', 'g1');
    expect(markRssItemRead(c, 'f1', 'g1')).toBe(c);
    expect(markRssItemRead(c, 'zzz', 'g1')).toBe(c);
    expect(parseRssConfig(serializeRssConfig(c)).feedOptions[0]).toMatchObject({
      id: 'f1',
      read: ['g1'],
    });
    expect(removeRssFeed(c, 'f1').feedOptions).toEqual([]);
  });
});

describe('parseFeedXml', () => {
  it('parses RSS 2.0 with CDATA and entities', () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Blog &amp; Co</title>
      <item><title><![CDATA[Hello <b>world</b> & more]]></title><link>https://x.test/1</link>
      <guid isPermaLink="false">g-1</guid><description>a &lt;p&gt; &#39;q&#39; &#x41;</description>
      <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><comments>https://x.test/1#c</comments></item>
      <item><link>https://x.test/2</link></item></channel></rss>`;
    const { title, items } = parseFeedXml(xml);
    expect(title).toBe('Blog & Co');
    expect(items[0]).toMatchObject({
      title: 'Hello <b>world</b> & more',
      guid: 'g-1',
      description: "a <p> 'q' A",
      comments: 'https://x.test/1#c',
    });
    expect(items[1]).toMatchObject({ title: 'No Title', guid: 'https://x.test/2' });
  });
  it('parses Atom entries', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Feed</title>
      <link href="https://x.test/" rel="self"/>
      <entry><title>One</title><link rel="replies" href="https://x.test/r"/>
      <link href="https://x.test/one"/><id>urn:1</id><updated>2026-11-01T00:00:00Z</updated>
      <summary>sum</summary></entry>
      <entry><title>Two</title><link href="https://x.test/two"/><published>2026-10-01T00:00:00Z</published></entry></feed>`;
    const { title, items } = parseFeedXml(xml);
    expect(title).toBe('Atom Feed');
    expect(items[0]).toMatchObject({
      link: 'https://x.test/one',
      guid: 'urn:1',
      pubDate: '2026-11-01T00:00:00Z',
      description: 'sum',
    });
    expect(items[1]).toMatchObject({ guid: 'https://x.test/two', pubDate: '2026-10-01T00:00:00Z' });
  });
  it('handles empty input', () => {
    expect(parseFeedXml('')).toEqual({ title: '', items: [] });
    expect(parseFeedXml('garbage').items).toEqual([]);
  });
});
