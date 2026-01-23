
import { h, Fragment } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { parseReadItLater, serializeReadItLater, markAsRead, markAsNew, deleteItem, deleteAllRead, ReadItLaterItem } from './ReadItLaterLogic';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';
import { ExternalLink, Check, Trash2, Archive, RefreshCw, X, RotateCcw } from 'lucide-preact';

interface ReadItLaterWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS';
  focusMode?: 'WIDGET' | 'ARCHIVE' | 'CODE'; // Passed from parent
  onChange?: (newContent: string) => void;
}

export const ReadItLaterWidget = ({ content, mode = 'SMALL', focusMode = 'WIDGET', onChange }: ReadItLaterWidgetProps) => {
  const config = useMemo(() => parseReadItLater(content), [content]);

  const sortedItems = useMemo(() => {
    return [...config.items].sort((a, b) => b.createdAt - a.createdAt);
  }, [config.items]);

  const newItems = sortedItems.filter(i => i.status === 'new');
  const readItems = sortedItems.filter(i => i.status === 'read');

  const handleMarkAsRead = (id: string) => {
    if (!onChange) return;
    const newConfig = markAsRead(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleMarkAsNew = (id: string) => {
    if (!onChange) return;
    const newConfig = markAsNew(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleDelete = (id: string) => {
    if (!onChange) return;
    const newConfig = deleteItem(config, id);
    onChange(serializeReadItLater(newConfig));
  };

  const handleDeleteAllRead = () => {
    if (!onChange) return;
    if (confirm('Are you sure you want to delete all read items?')) {
      const newConfig = deleteAllRead(config);
      onChange(serializeReadItLater(newConfig));
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

  // Focus View

  if (focusMode === 'ARCHIVE') {
    return (
      <div className="flex flex-col h-full w-full">
        <div className="border-b border-[var(--los-border)] p-2 flex justify-between items-center bg-[var(--los-bg)]">
          <MonoText className="text-[var(--los-muted)] text-xs">ARCHIVED ITEMS ({readItems.length})</MonoText>
          {readItems.length > 0 && (
            <button
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
            readItems.map(item => (
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
    )
  }

  // Default Focus Widget View (New Items)
  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b border-[var(--los-border)] p-2 flex justify-between items-center bg-[var(--los-bg)]">
        <MonoText className="text-[var(--los-muted)] text-xs">READING LIST ({newItems.length})</MonoText>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--los-border)]">
        {newItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--los-muted)]">
            <Check className="w-8 h-8 mb-2 opacity-50" />
            <MonoText>All caught up!</MonoText>
          </div>
        ) : (
          newItems.map(item => (
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
  onDelete
}: {
  item: ReadItLaterItem,
  onPrimary: () => void,
  primaryIcon: any,
  primaryLabel: string,
  onDelete?: () => void
}) => {
  return (
    <div className="py-3 px-2 group hover:bg-white/5 transition-colors flex flex-col md:flex-row gap-3 items-start">
      <div className="w-full md:flex-1 md:min-w-0">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
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
                {item.tags.map(tag => (
                  <span key={tag} className="bg-[var(--los-border)] px-1 rounded text-[var(--los-fg)] opacity-70">#{tag}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions - Horizontal on Mobile (below), Vertical on Desktop (right) */}
      <div className="flex flex-row md:flex-col gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-[var(--los-bg)] mt-1 md:mt-0 md:pl-2 md:w-auto border-t md:border-t-0 border-[var(--los-border)] md:border-none pt-2 md:pt-0 shrink-0 w-auto md:w-auto justify-end md:justify-start self-end md:self-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onPrimary(); }}
          title={primaryLabel}
          className="flex-none flex justify-center p-2 hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] text-[var(--los-muted)] rounded transition-colors"
        >
          {primaryIcon}
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
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="flex-none flex justify-center p-2 hover:text-red-500 text-[var(--los-muted)] rounded transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
