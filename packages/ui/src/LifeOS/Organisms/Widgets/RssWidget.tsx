import { h, Fragment } from 'preact';
import { memo } from 'preact/compat';
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import { RssConfig, RssItem, parseRssConfig, serializeRssConfig, fetchFeedXml, parseFeedItems, markItemAsRead, addFeed, removeFeed } from './RssLogic';
import { ReadItLaterItem } from './ReadItLaterLogic';
import { Logger } from '@lifosy/core';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';
import { ExternalLink, MessageSquare, Check, RefreshCw, Trash2, Plus, Rss, Bookmark } from 'lucide-preact';

const logger = new Logger('RssWidget');

interface RssWidgetProps {
  content?: string;
  mode?: 'SMALL' | 'FOCUS';
  onChange?: (newContent: string) => void;
  onReadItLater?: (item: RssItem) => void;
  path?: string; // Kept for compatibility but ignored
}

const RssWidgetInternal = ({ content, mode = 'SMALL', onChange, onReadItLater }: RssWidgetProps) => {
  // Persist last valid config to prevent reset on undefined content (loading state)
  const lastValidConfig = useRef<RssConfig>(parseRssConfig('')); // Initialize with default

  const config = useMemo(() => {
    if (content === undefined) return lastValidConfig.current;

    // Check for empty string vs actual empty config?
    // If content is empty string, parseRssConfig returns empty defaults.
    // Ideally we treat empty string as "empty file".
    // But undefined is "loading/unknown".

    const c = parseRssConfig(content);
    lastValidConfig.current = c;
    return c;
  }, [content]); // content dependency


  // RAW fetched items (unfiltered by read status, but mapped to internal structure)
  const [rawItems, setRawItems] = useState<(RssItem & { feedId: string })[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Optimistic tracking
  const optimisticReadIds = useRef<Set<string>>(new Set());

  // Derived visible items
  const items = useMemo(() => {
    const allReadIds = new Set(config.feedOptions.flatMap(f => f.read));

    return rawItems.filter(item => {
      const id = item.guid || item.link;
      return !allReadIds.has(id) && !optimisticReadIds.current.has(id);
    }).sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [rawItems, config]); // optimisticReadIds updates are reflected via rawItems state update (setRawItems shallow clone)

  // Fetch Logic - Only runs when URLs change
  // We track initiated URLs to dedupe requests if the component re-renders while fetching
  const initiatedUrls = useRef<string>('');

  useEffect(() => {
    let mounted = true;
    const currentFeedUrls = JSON.stringify(config.feedOptions.map(f => f.url));

    // Refetch only if URLs change (deduped by initiatedUrls ref)
    // We do NOT rely on initialLoaded state for the trigger, as that causes race conditions.
    if (currentFeedUrls !== initiatedUrls.current) {
      initiatedUrls.current = currentFeedUrls;

      const loadFeeds = async () => {
        const allNewItems: (RssItem & { feedId: string })[] = [];
        const fetchPromises = config.feedOptions.map(async (feed) => {
          const xml = await fetchFeedXml(feed.url);
          if (xml) {
            const parsedFn = parseFeedItems(xml);
            return parsedFn.map(item => ({ ...item, feedId: feed.id }));
          }
          return [];
        });
        const results = await Promise.all(fetchPromises);
        if (!mounted) return;
        results.forEach(res => allNewItems.push(...res));
        setRawItems(allNewItems);
        setInitialLoaded(true);
      };

      if (config.feedOptions.length > 0) {
        loadFeeds();
      } else {
        setRawItems([]);
        setInitialLoaded(true);
      }
    }

    return () => { mounted = false; };
  }, [config.feedOptions]); // Depend on feedOptions array to avoid refetch on read status changes

  // Stable Callbacks Pattern associated with Refs for props/config
  const latestProps = useRef({ onChange, onReadItLater, config });
  latestProps.current = { onChange, onReadItLater, config };

  const handleRead = useCallback((item: RssItem & { feedId: string }) => {
    const { onChange, config } = latestProps.current;
    if (!onChange) return;

    const idToMark = item.guid || item.link;
    optimisticReadIds.current.add(idToMark);

    // Force re-render of useMemo by shallow cloning rawItems
    setRawItems(prev => [...prev]);

    const newConfig = markItemAsRead(config, item.feedId, idToMark);
    onChange(serializeRssConfig(newConfig));
  }, []); // Truly stable callback

  const handleRil = useCallback((item: RssItem) => {
    latestProps.current.onReadItLater?.(item);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      {config.feedOptions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--los-muted)] p-4 text-center">
          <Rss className="w-8 h-8 mb-2 opacity-50" />
          <MonoText>No RSS feeds configured.</MonoText>
          {mode === 'SMALL' && <MonoText className="text-xs mt-1">Focus to add feeds.</MonoText>}
        </div>
      )}

      {!initialLoaded && rawItems.length === 0 && config.feedOptions.length > 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          <MonoText>Fetching feeds...</MonoText>
        </div>
      )}

      {initialLoaded && items.length === 0 && config.feedOptions.length > 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <Check className="w-8 h-8 mb-2 opacity-50" />
          <MonoText>All caught up!</MonoText>
        </div>
      )}

      <div className="divide-y divide-[var(--los-border)] overflow-y-auto">
        {items.map((item, idx) => (
          <RssItemRow
            key={`${item.feedId}-${item.guid || item.link}`}
            item={item}
            onRead={handleRead}
            onReadItLater={handleRil}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
};

// Export memoized version to prevent re-renders from unstable parent props (like inline onChange in FocusedTile)
// We only need to re-render if content string changes or mode changes.
// The internal state (loading, rawItems) handles itself.
// The callbacks (onChange, onReadItLater) are handled by internal Refs, so their prop identity doesn't matter.
export const RssWidget = memo(RssWidgetInternal, (prev, next) => {
  return prev.content === next.content && prev.mode === next.mode && prev.path === next.path;
});

// Wrapper for Item Row
const RssItemRow = memo(({ item, onRead, onReadItLater, mode }: { item: RssItem & { feedId: string }, onRead: (i: any) => void, onReadItLater: (i: any) => void, mode: string }) => {
  const [readState, setReadState] = useState<'IDLE' | 'LOADING'>('IDLE');
  const [rilState, setRilState] = useState<'IDLE' | 'LOADING' | 'SUCCESS'>('IDLE');

  const handleRead = async () => {
    setReadState('LOADING');
    await new Promise(r => setTimeout(r, 300));
    onRead(item);
  };

  const handleRil = async () => {
    logger.debug('handleRil called');
    // Using onReadItLater directly
    setRilState('LOADING');
    onReadItLater(item);
    await new Promise(r => setTimeout(r, 600));
    setRilState('SUCCESS');
    setTimeout(() => setRilState('IDLE'), 2000);
  };

  return (
    <div className="py-3 px-1 group hover:bg-white/5 transition-colors">
      <div className="flex flex-col md:flex-row gap-2 items-start">
        <div className="w-full md:flex-1 md:min-w-0">
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
            <MonoText className="font-bold text-[var(--los-fg)] hover:text-[var(--los-accent)] whitespace-normal break-words block">
              {item.title}
            </MonoText>
          </a>
          {mode === 'FOCUS' && item.description && (
            <div className="text-xs text-[var(--los-muted)] line-clamp-2 mt-1" dangerouslySetInnerHTML={{ __html: item.description }} />
          )}
          <div className="flex gap-4 mt-2">
            {item.comments && (
              <a href={item.comments} target="_blank" rel="noopener noreferrer" className="flex items-center text-[10px] text-[var(--los-muted)] hover:text-[var(--los-fg)]" onClick={(e) => e.stopPropagation()}>
                <MessageSquare className="w-3 h-3 mr-1" />
                Comments
              </a>
            )}
            <span className="text-[10px] text-[var(--los-muted)]">{item.pubDate ? new Date(item.pubDate).toLocaleDateString() : ''}</span>
          </div>
        </div>

        <div className="flex flex-row md:flex-col gap-3 bg-[var(--los-bg)] mt-1 md:mt-0 md:pl-2 md:w-auto border-t md:border-t-0 border-[var(--los-border)] md:border-none pt-2 md:pt-0 shrink-0 w-auto md:w-auto justify-end md:justify-start self-end md:self-auto">
          <button
            title="Mark as Read"
            disabled={readState === 'LOADING'}
            onClick={(e) => { e.stopPropagation(); handleRead(); }}
            className="flex-none flex justify-center p-2 hover:text-[var(--los-accent)] text-[var(--los-muted)] disabled:opacity-50"
          >
            {readState === 'LOADING' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          </button>

          <button
            title="Read It Later"
            disabled={rilState === 'LOADING' || rilState === 'SUCCESS'}
            onClick={(e) => { e.stopPropagation(); handleRil(); }}
            className={cn(
              "flex-none flex justify-center p-2 transition-colors disabled:opacity-50",
              rilState === 'SUCCESS' ? "text-green-500" : "hover:text-[var(--los-accent)] text-[var(--los-muted)]"
            )}
          >
            {rilState === 'LOADING' ? <RefreshCw className="w-5 h-5 animate-spin" /> :
              rilState === 'SUCCESS' ? <Check className="w-5 h-5" /> :
                <Bookmark className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
});

export const RssFeedManager = ({ content, onChange }: { content: string, onChange: (c: string) => void }) => {
  const [url, setUrl] = useState('');
  const config = useMemo(() => parseRssConfig(content), [content]);

  const handleAdd = () => {
    if (!url) return;
    const newConfig = addFeed(config, url);
    onChange(serializeRssConfig(newConfig));
    setUrl('');
  };

  const handleRemove = (id: string) => {
    const newConfig = removeFeed(config, id);
    onChange(serializeRssConfig(newConfig));
  };

  return (
    <div className="p-4">
      <MonoHeader className="mb-4">Manage Feeds</MonoHeader>
      <div className="flex gap-2 mb-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://example.com/feed.xml"
          className="bg-transparent border border-[var(--los-border)] p-2 flex-1 font-mono text-sm focus:outline-none focus:border-[var(--los-accent)]"
        />
        <button onClick={handleAdd} className="bg-[var(--los-fg)] text-[var(--los-bg)] px-4 hover:opacity-80 font-bold text-xs uppercase">
          Add
        </button>
      </div>
      <div className="space-y-2">
        {config.feedOptions.map(feed => (
          <div key={feed.id} className="flex items-center justify-between border border-[var(--los-border)] p-2">
            <span className="font-mono text-xs truncate flex-1 mr-2">{feed.url}</span>
            <button onClick={() => handleRemove(feed.id)} className="text-[var(--los-muted)] hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {config.feedOptions.length === 0 && (
          <div className="text-[var(--los-muted)] text-center text-xs py-4">No feeds configured</div>
        )}
      </div>
    </div>
  );
};
