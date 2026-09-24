import {
  deleteAll,
  deleteAllRead,
  deleteItem,
  markAsNew,
  markAsRead,
  parseReadItLater,
  type ReadItLaterItem,
  serializeReadItLater,
} from '@lifosy/formats';
import { Archive, Check, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';

interface ReadItLaterWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  focusMode?: 'WIDGET' | 'ARCHIVE' | 'CODE'; // Passed from parent
  onChange?: (newContent: string) => void;
}

import { readItLaterService } from './ReadItLaterService';

export const ReadItLaterWidget = ({
  content,
  mode = 'SMALL',
  focusMode = 'WIDGET',
  onChange,
}: ReadItLaterWidgetProps) => {
  const config = useMemo(() => parseReadItLater(content), [content]);

  // Manual subscription to optimistic changes
  const [optimisticChanges, setOptimisticChanges] = useState(
    readItLaterService.optimisticChanges.value,
  );

  useEffect(() => {
    setOptimisticChanges(readItLaterService.optimisticChanges.value);
    return readItLaterService.optimisticChanges.subscribe((val) => {
      setOptimisticChanges(val);
    });
  }, []);

  const mergedItems = useMemo(() => {
    // Merge persistent config with optimistic changes
    let items = [...config.items];

    // Apply Optimistic Overrides
    items = items.map((item) => {
      const change = optimisticChanges[item.id];
      if (!change) return item;

      // If deleted, filter out later
      if (change.deleted) return { ...item, _deleted: true };

      return {
        ...item,
        status: change.status || item.status,
      };
    });

    // Filter out deleted
    // @ts-expect-error
    items = items.filter((i) => !i._deleted);

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [config.items, optimisticChanges]);

  const newItems = mergedItems.filter((i) => i.status === 'new');
  const readItems = mergedItems.filter((i) => i.status === 'read');

  const handleMarkAsRead = (id: string) => {
    if (!onChange) return;
    readItLaterService.markAsRead(id); // Optimistic Global Update
    const newConfig = markAsRead(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleMarkAsNew = (id: string) => {
    if (!onChange) return;
    readItLaterService.markAsNew(id); // Optimistic Global Update
    const newConfig = markAsNew(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleDelete = (id: string) => {
    if (!onChange) return;
    readItLaterService.deleteItem(id); // Optimistic Global Update
    const newConfig = deleteItem(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleDeleteAllRead = () => {
    if (!onChange) return;
    if (confirm('Are you sure you want to delete all read items?')) {
      // Optimistic update for all read items
      readItems.forEach((i) => {
        readItLaterService.deleteItem(i.id);
      });

      const newConfig = deleteAllRead(config);
      onChange(serializeReadItLater(newConfig));
    }
  };

  const handleClearAll = () => {
    if (!onChange) return;
    const counts = `${newItems.length} unread and ${readItems.length} read`;
    if (confirm(`Clear the whole reading list — ${counts} items? This cannot be undone.`)) {
      mergedItems.forEach((i) => {
        readItLaterService.deleteItem(i.id);
      });
      onChange(serializeReadItLater(deleteAll(config)));
    }
  };

  // Small View: Only New Items
  if (mode === 'SMALL') {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {newItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--los-muted)] p-4 text-center">
            <Check className="w-8 h-8 mb-2 opacity-50" />
            <MonoText>All caught up!</MonoText>
          </div>
        ) : (
          <div className="divide-y divide-[var(--los-border)] overflow-y-auto">
            {newItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onPrimary={() => handleMarkAsRead(item.id)}
                primaryIcon={<Check className="w-4 h-4" />}
                primaryLabel="Mark Read"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
        <MonoHeader className="text-5xl font-bold text-[var(--los-fg)] mb-1">
          {newItems.length}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
          SAVED ITEMS
        </MonoText>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    return (
      <CompactWidgetLayout>
        <div className="flex justify-between items-center shrink-0 border-b border-[var(--los-border)] pb-2">
          <MonoHeader className="text-xs text-[var(--los-muted)]">READING LIST</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-accent)]">
            {newItems.length} ITEMS
          </MonoText>
        </div>

        <CompactList>
          {newItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--los-muted)] text-center">
              <Check className="w-8 h-8 mb-2 opacity-50" />
              <MonoText>All caught up!</MonoText>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {newItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onPrimary={() => handleMarkAsRead(item.id)}
                  primaryIcon={<Check className="w-4 h-4" />}
                  primaryLabel="Mark Read"
                  compact={true}
                />
              ))}
            </div>
          )}
        </CompactList>
      </CompactWidgetLayout>
    );
  }

  // Focus View

  if (focusMode === 'ARCHIVE') {
    return (
      <div className="flex flex-col h-full w-full">
        <div className="border-b border-[var(--los-border)] p-2 flex justify-between items-center bg-[var(--los-bg)]">
          <MonoText className="text-[var(--los-muted)] text-xs">
            ARCHIVED ITEMS ({readItems.length})
          </MonoText>
          {readItems.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllRead}
              className="flex items-center gap-2 text-xs text-red-500 hover:text-red-400 font-mono px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              DELETE ALL
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--los-border)]">
          {readItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--los-muted)]">
              <Archive className="w-8 h-8 mb-2 opacity-50" />
              <MonoText>No archived items.</MonoText>
            </div>
          ) : (
            readItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onPrimary={() => handleMarkAsNew(item.id)}
                primaryIcon={<RotateCcw className="w-4 h-4" />}
                primaryLabel="Mark New"
                onDelete={() => handleDelete(item.id)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // Default Focus Widget View (New Items)
  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b border-[var(--los-border)] p-2 flex justify-between items-center bg-[var(--los-bg)]">
        <MonoText className="text-[var(--los-muted)] text-xs">
          READING LIST ({newItems.length})
        </MonoText>
        {mergedItems.length > 0 && onChange && (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-2 text-xs text-red-500 hover:text-red-400 font-mono px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            CLEAR ALL
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--los-border)]">
        {newItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--los-muted)]">
            <Check className="w-8 h-8 mb-2 opacity-50" />
            <MonoText>All caught up!</MonoText>
          </div>
        ) : (
          newItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onPrimary={() => handleMarkAsRead(item.id)}
              primaryIcon={<Check className="w-4 h-4" />}
              primaryLabel="Mark Read"
            />
          ))
        )}
      </div>
    </div>
  );
};

const ItemRow = ({
  item,
  onPrimary,
  primaryIcon,
  primaryLabel,
  onDelete,
  compact = false,
}: {
  item: ReadItLaterItem;
  onPrimary: () => void;
  primaryIcon: any;
  primaryLabel: string;
  onDelete?: () => void;
  compact?: boolean;
}) => {
  const [primaryState, setPrimaryState] = useState<'IDLE' | 'LOADING'>('IDLE');
  const [deleteState, setDeleteState] = useState<'IDLE' | 'LOADING'>('IDLE');

  const handlePrimary = async () => {
    setPrimaryState('LOADING');
    // Simulate delay/action
    await new Promise((r) => setTimeout(r, 400));
    onPrimary();
  };

  const handleDelete = async () => {
    setDeleteState('LOADING');
    await new Promise((r) => setTimeout(r, 400));
    if (onDelete) onDelete();
  };

  return (
    <div className="py-3 px-2 group hover:bg-white/5 transition-colors flex flex-col gap-3 items-start">
      <div className="w-full">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          onClick={(e) => e.stopPropagation()}
        >
          <MonoText className="font-bold text-[var(--los-fg)] hover:text-[var(--los-accent)] whitespace-normal break-words block mb-1">
            {item.name || item.url}
          </MonoText>
        </a>
        <div className="flex gap-2 text-[10px] text-[var(--los-muted)]">
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          {item.tags && item.tags.length > 0 && (
            <>
              <span>•</span>
              <div className="flex gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-[var(--los-border)] px-1 rounded text-[var(--los-fg)] opacity-70"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions - Always Horizontal below */}
      <div
        className={cn(
          'flex flex-row gap-3 mt-1 border-t border-[var(--los-border)] pt-2 shrink-0 w-full justify-end',
          compact ? 'py-1 mt-0' : 'pt-2',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrimary();
          }}
          title={primaryLabel}
          disabled={primaryState === 'LOADING'}
          className="flex-none flex justify-center p-2 hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] text-[var(--los-muted)] rounded transition-colors disabled:opacity-50"
        >
          {primaryState === 'LOADING' ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            primaryIcon
          )}
        </button>

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open"
          className="flex-none flex justify-center p-2 hover:text-[var(--los-fg)] text-[var(--los-muted)] rounded transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-5 h-5" />
        </a>

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete"
            disabled={deleteState === 'LOADING'}
            className="flex-none flex justify-center p-2 hover:text-red-500 text-[var(--los-muted)] rounded transition-colors disabled:opacity-50"
          >
            {deleteState === 'LOADING' ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
