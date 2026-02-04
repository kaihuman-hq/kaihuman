
import { h, Fragment } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { RssConfig, RssItem, parseRssConfig, serializeRssConfig, fetchFeedXml, parseFeedItems, markItemAsRead, addFeed, removeFeed } from './RssLogic';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';
import { ExternalLink, MessageSquare, Check, RefreshCw, Trash2, Plus, Rss } from 'lucide-preact';

interface RssWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS';
  onChange?: (newContent: string) => void;
  onReadItLater?: (item: RssItem) => void;
}

export const RssWidget = ({ content, mode = 'SMALL', onChange, onReadItLater }: RssWidgetProps) => {
  const config = useMemo(() => parseRssConfig(content), [content]);
  const [items, setItems] = useState<(RssItem & { feedId: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  // Combine and de-duplicate fetches
  useEffect(() => {
    let mounted = true;

    const loadFeeds = async () => {
      setLoading(true);
      const allItems: (RssItem & { feedId: string })[] = [];

      const fetchPromises = config.feedOptions.map(async (feed) => {
        const xml = await fetchFeedXml(feed.url);
        if (xml) {
          const parsedFn = parseFeedItems(xml);
          // Filter out read items
          const unread = parsedFn.filter(item => {
            const id = item.guid || item.link;
            return !feed.read.includes(id);
          });
          return unread.map(item => ({ ...item, feedId: feed.id }));
        }
        return [];
      });

      const results = await Promise.all(fetchPromises);
      if (!mounted) return;

      results.forEach(res => allItems.push(...res));

      // Sort by date (newest first)
      allItems.sort((a, b) => {
        const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return dateB - dateA;
      });

      setItems(allItems);
      setLoading(false);
      setLastUpdated(Date.now());
    };

    if (config.feedOptions.length > 0) {
      loadFeeds();
    } else {
      setItems([]);
    }

    return () => { mounted = false; };
  }, [content]); // rudimentary re-fetch on content change (e.g. adding feed), but we might want manual refresh too.

  const handleRead = (item: RssItem & { feedId: string }) => {
    if (!onChange) return;

    const idToMark = item.guid || item.link;
    const newConfig = markItemAsRead(config, item.feedId, idToMark);
    onChange(serializeRssConfig(newConfig));

    // Optimistic updat to avoid flicker before re-fetch or if re-fetch is skipped
    setItems(prev => prev.filter(i => (i.guid || i.link) !== idToMark));
  };

  return (
    <div className="flex flex-col h-full w-full">
      {config.feedOptions.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--los-muted)] p-4 text-center">
          <Rss className="w-8 h-8 mb-2 opacity-50" />
          <MonoText>No RSS feeds configured.</MonoText>
          {mode === 'SMALL' && <MonoText className="text-xs mt-1">Focus to add feeds.</MonoText>}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          <MonoText>Fetching feeds...</MonoText>
        </div>
      )}

      {!loading && items.length === 0 && config.feedOptions.length > 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--los-muted)]">
          <Check className="w-8 h-8 mb-2 opacity-50" />
          <MonoText>All caught up!</MonoText>
        </div>
      )}

      <div className="divide-y divide-[var(--los-border)] overflow-y-auto">
        {items.map((item, idx) => (
          <RssItemRow
            key={`${item.feedId}-${item.guid || item.link}-${idx}`}
            item={item}
            onRead={() => handleRead(item)}
            onReadItLater={() => onReadItLater?.(item)}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
};

// Wrapper for Item Row
const RssItemRow = ({ item, onRead, onReadItLater, mode }: { item: RssItem, onRead: () => void, onReadItLater: () => void, mode: string }) => {
  const [readState, setReadState] = useState<'IDLE' | 'LOADING'>('IDLE');
  const [rilState, setRilState] = useState<'IDLE' | 'LOADING' | 'SUCCESS'>('IDLE');

  const handleRead = async () => {
    setReadState('LOADING');
    // Small delay to show spinner if onRead is instant
    // But onRead usually removes the item, so spinner might just be brief until unmount
    await new Promise(r => setTimeout(r, 300));
    onRead();
  };

  const handleRil = async () => {
    setRilState('LOADING');
    console.log('[RssWidget] handleRil called');
    onReadItLater();
    // Simulate some logic or just wait a bit
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

        {/* Actions - Horizontal on Mobile (below), Vertical on Desktop (right) */}
        <div className="flex flex-row md:flex-col gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-[var(--los-bg)] mt-1 md:mt-0 md:pl-2 md:w-auto border-t md:border-t-0 border-[var(--los-border)] md:border-none pt-2 md:pt-0 shrink-0 w-auto md:w-auto justify-end md:justify-start self-end md:self-auto">
          <button
            title="Mark as Read"
            disabled={readState === 'LOADING'}
            onClick={(e) => { e.stopPropagation(); handleRead(); }}
            className="flex-none flex justify-center p-2 hover:text-[var(--los-accent)] text-[var(--los-muted)] disabled:opacity-50"
          >
            {readState === 'LOADING' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          </button>

          <button
            title="Read Later"
            disabled={rilState === 'LOADING' || rilState === 'SUCCESS'}
            onClick={(e) => { e.stopPropagation(); handleRil(); }}
            className={cn(
              "flex-none flex justify-center p-2 transition-colors disabled:opacity-100",
              rilState === 'SUCCESS' ? "text-green-500" : "hover:text-[var(--los-accent)] text-[var(--los-muted)]"
            )}
          >
            {rilState === 'LOADING' ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : rilState === 'SUCCESS' ? (
              <Check className="w-5 h-5" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
            )}
          </button>

          <a href={item.link} target="_blank" rel="noopener noreferrer" title="Open" className="flex-none flex justify-center p-2 hover:text-[var(--los-accent)] text-[var(--los-muted)]" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </div>
    </div>
  )
}


export const RssFeedManager = ({ content, onChange }: { content: string, onChange?: (c: string) => void }) => {
  const config = useMemo(() => parseRssConfig(content), [content]);
  const [newUrl, setNewUrl] = useState("");

  const handleAdd = () => {
    if (!newUrl || !onChange) return;
    const newConfig = addFeed(config, newUrl);
    onChange(serializeRssConfig(newConfig));
    setNewUrl("");
  };

  const handleRemove = (id: string) => {
    if (!onChange) return;
    const newConfig = removeFeed(config, id);
    onChange(serializeRssConfig(newConfig));
  };

  return (
    <div className="p-8 w-full max-w-2xl mx-auto">
      <MonoHeader className="mb-6">Manage Feeds</MonoHeader>

      <div className="flex gap-2 mb-8">
        <input
          type="text"
          value={newUrl}
          onInput={(e) => setNewUrl(e.currentTarget.value)}
          placeholder="https://news.ycombinator.com/rss"
          className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-4 py-2 font-mono text-xs focus:border-[var(--los-accent)] outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="bg-[var(--los-fg)] text-[var(--los-bg)] px-4 py-2 font-mono text-xs font-bold hover:bg-[var(--los-accent)] transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          ADD FEED
        </button>
      </div>

      <div className="space-y-2">
        {config.feedOptions.map(feed => (
          <div key={feed.id} className="flex items-center justify-between p-3 border border-[var(--los-border)] bg-[var(--los-bg)]">
            <div className="truncate flex-1 mr-4">
              <MonoText>{feed.url}</MonoText>
              <div className="text-[10px] text-[var(--los-muted)] mt-1">ID: {feed.id}</div>
            </div>
            <button
              onClick={() => handleRemove(feed.id)}
              className="text-red-500 hover:text-red-400 p-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {config.feedOptions.length === 0 && (
          <div className="text-center text-[var(--los-muted)] py-8 border border-dashed border-[var(--los-border)]">
            <MonoText>No feeds added yet.</MonoText>
          </div>
        )}
      </div>
    </div>
  );
};
