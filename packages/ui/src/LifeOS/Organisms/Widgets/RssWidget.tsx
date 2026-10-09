import { Logger } from '@kaihuman/core';
import { Bookmark, Check, MessageSquare, RefreshCw, Rss, Trash2 } from 'lucide-preact';
import { memo } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';
import {
  addFeed,
  markItemAsRead,
  parseRssConfig,
  type RssConfig,
  type RssItem,
  removeFeed,
  serializeRssConfig,
} from './RssLogic';
import { rssService } from './RssService';

const logger = new Logger('RssWidget');

// Debug Logging
const _useRenderLog = (name: string, _props: any) => {
  useEffect(() => {
    logger.info(`[${name}] MOUNTED`);
    return () => logger.info(`[${name}] UNMOUNTED`);
  }, [name]);
  useEffect(() => {
    logger.info(`[${name}] RENDER`);
  });
};

interface RssWidgetProps {
  content?: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
  onReadItLater?: (item: RssItem) => void;
  path?: string; // Kept for compatibility but ignored
}

const RssWidgetInternal = ({
  content,
  mode = 'SMALL',
  onChange,
  onReadItLater,
}: RssWidgetProps) => {
  // Debug Mount
  useEffect(() => {
    logger.info('[RssWidget] MOUNTED');
    return () => logger.info('[RssWidget] UNMOUNTED');
  }, []);

  // Persist last valid config to prevent reset on undefined content (loading state)
  const lastValidConfig = useRef<RssConfig>(parseRssConfig('')); // Initialize with default

  const config = useMemo(() => {
    if (content === undefined) return lastValidConfig.current;
    const c = parseRssConfig(content);
    lastValidConfig.current = c;
    return c;
  }, [content]); // content dependency

  // Trigger fetches via Service
  useEffect(() => {
    config.feedOptions.forEach((feed) => {
      rssService.ensureFeed(feed.url);
    });
  }, [config.feedOptions]);

  // Manual Subscription to Signal to prevent Render-Cycle
  const [items, setItems] = useState<(RssItem & { feedId: string })[]>([]);

  useEffect(() => {
    const computeItems = () => {
      const allReadIds = new Set(config.feedOptions.flatMap((f) => f.read));
      const allItems: (RssItem & { feedId: string })[] = [];

      config.feedOptions.forEach((feed) => {
        const feedState = rssService.feeds.value[feed.url];
        if (feedState?.items) {
          feedState.items.forEach((item) => {
            allItems.push({ ...item, feedId: feed.id });
          });
        }
      });

      return allItems
        .filter((item) => {
          const id = item.guid || item.link;
          // Use Service's helper which checks both Config AND Global Optimistic State
          return !rssService.isRead(id, allReadIds);
        })
        .sort((a, b) => {
          const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
          const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
          return dateB - dateA;
        });
    };

    setItems(computeItems());

    // Subscribe to BOTH feeds and optimisticReads
    // We create a wrapper effect to subscribe to multiple signals easily or just two subscriptions
    const disposeFeeds = rssService.feeds.subscribe(() => setItems(computeItems()));
    const disposeOptimistic = rssService.optimisticReads.subscribe(() => setItems(computeItems()));

    return () => {
      disposeFeeds();
      disposeOptimistic();
    };
  }, [config]);

  // Stable Callbacks Pattern
  const latestProps = useRef({ onChange, onReadItLater, config });
  latestProps.current = { onChange, onReadItLater, config };

  const handleRead = useCallback((item: RssItem & { feedId: string }) => {
    const { onChange, config } = latestProps.current;
    if (!onChange) return;

    const idToMark = item.guid || item.link;
    logger.info(`[handleRead] Marking: ${idToMark}`);

    // Global Optimistic Update (Persists across unmounts)
    rssService.markOptimisticRead(idToMark);

    const newConfig = markItemAsRead(config, item.feedId, idToMark);
    onChange(serializeRssConfig(newConfig));
  }, []);

  const handleRil = useCallback((item: RssItem) => {
    latestProps.current.onReadItLater?.(item);
  }, []);

  // Calculated Loading State used for UI feedback
  // We can also subscribe to loading state if critical, but checking value here during render is generally safe for simple booleans
  // IF we are not in a computed context. But accessing .value might register usage.
  // Safest to rely on `items` or creating a separate loading signal subscription.
  // For now, let's assume `isLoading = false` or derive it safely.
  // Accessing `rssService.feeds.value` here might re-trigger the cycle if we are not careful.
  // Let's rely on items length for "loading" feedback or use a separate subscription if needed.
  // A simple approximation:
  const isLoading = false; // Disable detailed loading state for safety for now.
  const hasItems = items.length > 0;

  return (
    <div className={cn('flex flex-col w-full', mode === 'SMALL' ? 'h-full' : 'min-h-full')}>
      {config.feedOptions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--los-muted)] p-4 text-center">
          <Rss className="w-8 h-8 mb-2 opacity-50" />
          <MonoText>No RSS feeds configured.</MonoText>
          {mode === 'SMALL' && <MonoText className="text-xs mt-1">Focus to add feeds.</MonoText>}
        </div>
      )}

      {mode === 'MOBILE_COLLAPSED' ? (
        <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
          <MonoHeader className="text-5xl font-bold text-[var(--los-accent)] mb-1">
            {items.length}
          </MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
            UNREAD ITEMS
          </MonoText>
        </div>
      ) : mode === 'MOBILE_EXPANDED' ? (
        <CompactWidgetLayout>
          <div className="flex justify-between items-center shrink-0 border-b border-[var(--los-border)] pb-2">
            <MonoHeader className="text-xs text-[var(--los-muted)]">FEEDS</MonoHeader>
            <MonoText className="text-[10px] text-[var(--los-accent)]">
              {items.length} UNREAD
            </MonoText>
          </div>

          <CompactList>
            {items.map((item, _idx) => (
              <RssItemRow
                key={`${item.feedId}-${item.guid || item.link}`}
                item={item}
                onRead={handleRead}
                onReadItLater={handleRil}
                mode={mode}
              />
            ))}
          </CompactList>
        </CompactWidgetLayout>
      ) : (
        <>
          {isLoading && !hasItems && config.feedOptions.length > 0 && (
            <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              <MonoText>Fetching feeds...</MonoText>
            </div>
          )}

          {!isLoading && !hasItems && config.feedOptions.length > 0 && (
            <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
              <Check className="w-8 h-8 mb-2 opacity-50" />
              <MonoText>All caught up!</MonoText>
            </div>
          )}

          <div
            className={cn(
              'divide-y divide-[var(--los-border)]',
              mode === 'SMALL' ? 'overflow-y-auto' : 'overflow-visible',
            )}
          >
            {items.map((item, _idx) => (
              <RssItemRow
                key={`${item.feedId}-${item.guid || item.link}`}
                item={item}
                onRead={handleRead}
                onReadItLater={handleRil}
                mode={mode}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Export memoized version to prevent re-renders from unstable parent props (like inline onChange in FocusedTile)
export const RssWidget = memo(RssWidgetInternal, (prev, next) => {
  return prev.content === next.content && prev.mode === next.mode && prev.path === next.path;
});

// Wrapper for Item Row
const RssItemRow = memo(
  ({
    item,
    onRead,
    onReadItLater,
    mode,
  }: {
    item: RssItem & { feedId: string };
    onRead: (i: any) => void;
    onReadItLater: (i: any) => void;
    mode: string;
  }) => {
    const [readState, setReadState] = useState<'IDLE' | 'LOADING'>('IDLE');
    const [rilState, setRilState] = useState<'IDLE' | 'LOADING' | 'SUCCESS'>('IDLE');

    const handleRead = async () => {
      setReadState('LOADING');
      await new Promise((r) => setTimeout(r, 300));
      onRead(item);
    };

    const handleRil = async () => {
      logger.debug('handleRil called');
      // Using onReadItLater directly
      setRilState('LOADING');
      onReadItLater(item);
      await new Promise((r) => setTimeout(r, 600));
      setRilState('SUCCESS');
      setTimeout(() => setRilState('IDLE'), 2000);
    };

    return (
      <div className="py-3 px-1 group hover:bg-white/5 transition-colors">
        <div className="flex flex-col gap-2 items-start">
          <div className="w-full">
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              onClick={(e) => e.stopPropagation()}
            >
              <MonoText className="font-bold text-[var(--los-fg)] hover:text-[var(--los-accent)] whitespace-normal break-words block">
                {item.title}
              </MonoText>
            </a>
            {mode === 'FOCUS' && item.description && (
              <div
                className="text-xs text-[var(--los-muted)] line-clamp-2 mt-1"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            )}
            <div className="flex gap-4 mt-2">
              {mode !== 'MOBILE_EXPANDED' && item.comments && (
                <a
                  href={item.comments}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-[10px] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Comments
                </a>
              )}
              {mode !== 'MOBILE_EXPANDED' && (
                <span className="text-[10px] text-[var(--los-muted)]">
                  {item.pubDate ? new Date(item.pubDate).toLocaleDateString() : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-row gap-3 mt-1 border-t border-[var(--los-border)] pt-2 shrink-0 w-full justify-end">
            <button
              type="button"
              title="Mark as Read"
              disabled={readState === 'LOADING'}
              onClick={(e) => {
                e.stopPropagation();
                handleRead();
              }}
              className="flex-none flex justify-center p-2 hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] text-[var(--los-muted)] rounded transition-colors disabled:opacity-50"
            >
              {readState === 'LOADING' ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              title="Read It Later"
              disabled={rilState === 'LOADING' || rilState === 'SUCCESS'}
              onClick={(e) => {
                e.stopPropagation();
                handleRil();
              }}
              className={cn(
                'flex-none flex justify-center p-2 rounded transition-colors disabled:opacity-50',
                rilState === 'SUCCESS'
                  ? 'text-green-500'
                  : 'hover:text-[var(--los-accent)] text-[var(--los-muted)]',
              )}
            >
              {rilState === 'LOADING' ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : rilState === 'SUCCESS' ? (
                <Check className="w-5 h-5" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

export const RssFeedManager = ({
  content,
  onChange,
}: {
  content: string;
  onChange: (c: string) => void;
}) => {
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
        <button
          type="button"
          onClick={handleAdd}
          className="bg-[var(--los-fg)] text-[var(--los-bg)] px-4 hover:opacity-80 font-bold text-xs uppercase"
        >
          Add
        </button>
      </div>
      <div className="space-y-2">
        {config.feedOptions.map((feed) => (
          <div
            key={feed.id}
            className="flex items-center justify-between border border-[var(--los-border)] p-2"
          >
            <span className="font-mono text-xs truncate flex-1 mr-2">{feed.url}</span>
            <button
              type="button"
              onClick={() => handleRemove(feed.id)}
              className="text-[var(--los-muted)] hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {config.feedOptions.length === 0 && (
          <div className="text-[var(--los-muted)] text-center text-xs py-4">
            No feeds configured
          </div>
        )}
      </div>
    </div>
  );
};
