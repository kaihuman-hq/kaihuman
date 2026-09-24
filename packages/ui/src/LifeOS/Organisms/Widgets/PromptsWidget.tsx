import { addPromptEntry, parsePrompts } from '@lifosy/formats';
import { Check, Copy } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactWidgetLayout } from './CompactWidgetLayout';
import { PromptsAddForm } from './PromptsAddForm';

export interface PromptsWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
}

const CopyButton = ({
  body,
  copied,
  onCopy,
}: {
  body: string;
  copied: boolean;
  onCopy: () => void;
}) => (
  <button
    type="button"
    title="Copy prompt"
    onClick={() => {
      navigator.clipboard?.writeText(body).then(onCopy, () => {});
    }}
    className={cn(
      'shrink-0 flex items-center gap-1 text-[9px] font-mono uppercase px-2 py-1 border transition-colors',
      copied
        ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
        : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
    )}
  >
    {copied ? <Check size={11} /> : <Copy size={11} />}
    {copied ? 'Copied' : 'Copy'}
  </button>
);

export const PromptsWidget = ({ content, mode, onChange }: PromptsWidgetProps) => {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const prompts = useMemo(() => parsePrompts(content), [content]);
  const totalCount = prompts.length;

  // All unique tags with occurrence counts, sorted by frequency
  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    for (const p of prompts) {
      for (const t of p.tags) {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
    }
    return [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [prompts]);

  // Keep the original index alongside the prompt so copy/expand state survives filtering
  const filtered = useMemo(() => {
    let result = prompts.map((prompt, index) => ({ prompt, index }));
    if (activeTag) result = result.filter(({ prompt }) => prompt.tags.includes(activeTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        ({ prompt }) =>
          prompt.title.toLowerCase().includes(q) ||
          prompt.body.toLowerCase().includes(q) ||
          prompt.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [prompts, activeTag, search]);

  const handleCopy = (index: number) => {
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex((current) => (current === index ? null : current));
    }, 1500);
  };

  const handleAdd = (title: string, tags: string[], body: string) => {
    onChange?.(addPromptEntry(content, { title, tags, body }));
  };

  if (mode === 'ADD') {
    return (
      <div className="w-full min-h-full p-4">
        <PromptsAddForm onAdd={handleAdd} />
      </div>
    );
  }

  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
        <MonoHeader className="text-5xl font-bold text-[var(--los-fg)] mb-1">
          {totalCount}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
          PROMPTS
        </MonoText>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    return (
      <CompactWidgetLayout>
        <div className="flex justify-between items-end shrink-0">
          <MonoHeader className="text-xs text-[var(--los-muted)]">PROMPTS</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} TOTAL</MonoText>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {prompts.slice(0, 6).map((prompt, index) => (
            <div
              key={`${prompt.title}-${index}`}
              className="flex items-center gap-2 border-b border-[var(--los-border)] pb-2 last:border-0"
            >
              <MonoText className="text-xs truncate flex-1">{prompt.title}</MonoText>
              <CopyButton
                body={prompt.body}
                copied={copiedIndex === index}
                onCopy={() => handleCopy(index)}
              />
            </div>
          ))}
          {totalCount === 0 && (
            <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">
              No prompts yet.
            </div>
          )}
        </div>
      </CompactWidgetLayout>
    );
  }

  if (mode === 'SMALL') {
    return (
      <div className="w-full flex flex-col p-4 relative h-full">
        <div className="flex justify-between items-end mb-2 shrink-0">
          <MonoHeader className="text-sm">PROMPTS</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} ITEMS</MonoText>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-2">
            {prompts.slice(0, 10).map((prompt, index) => (
              <div
                key={`${prompt.title}-${index}`}
                className="flex items-center gap-2 border-b border-[var(--los-border)] pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <MonoText className="text-xs leading-tight truncate block">
                    {prompt.title}
                  </MonoText>
                  {prompt.tags.length > 0 && (
                    <MonoText className="text-[9px] text-[var(--los-accent)] opacity-70 truncate block">
                      {prompt.tags.map((t) => `#${t}`).join(' ')}
                    </MonoText>
                  )}
                </div>
                <CopyButton
                  body={prompt.body}
                  copied={copiedIndex === index}
                  onCopy={() => handleCopy(index)}
                />
              </div>
            ))}
            {totalCount === 0 && (
              <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">
                No prompts yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── FOCUS mode ──────────────────────────────────────────────────────────────

  const isFiltered = !!activeTag || !!search.trim();

  return (
    <div className="w-full flex flex-col gap-4 p-6 min-h-full overflow-y-auto custom-scrollbar">
      {/* Search */}
      <input
        type="text"
        value={search}
        onInput={(e) => setSearch(e.currentTarget.value)}
        placeholder="Search prompts..."
        className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50"
      />

      {/* Tag badges */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(showAllTags ? allTags : allTags.slice(0, 10)).map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                activeTag === tag
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/10'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
              )}
            >
              #{tag}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
          {allTags.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllTags((v) => !v)}
              className="text-[10px] font-mono px-2 py-0.5 border border-dashed border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] hover:border-[var(--los-fg)] transition-colors"
            >
              {showAllTags ? 'Show less' : `+${allTags.length - 10} more`}
            </button>
          )}
        </div>
      )}

      {/* Prompt list */}
      <div className="flex flex-col gap-3">
        {filtered.map(({ prompt, index }) => (
          <div
            key={`${prompt.title}-${index}`}
            className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-3 last:border-0 last:pb-0"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setExpanded(expanded === index ? null : index)}
                className="flex-1 min-w-0 text-left"
              >
                <MonoText className="text-xs leading-tight break-words hover:text-[var(--los-accent)] transition-colors">
                  {prompt.title}
                </MonoText>
              </button>
              <CopyButton
                body={prompt.body}
                copied={copiedIndex === index}
                onCopy={() => handleCopy(index)}
              />
            </div>

            {prompt.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {prompt.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                    className="text-[9px] font-mono text-[var(--los-accent)] opacity-70 hover:opacity-100 transition-opacity"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}

            {expanded === index && (
              <pre className="mt-1 text-[11px] font-mono text-[var(--los-muted)] whitespace-pre-wrap break-words bg-[var(--los-bg)] border border-[var(--los-border)] p-2">
                {prompt.body}
              </pre>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-[var(--los-muted)] text-[10px] text-center py-8">
            {isFiltered ? 'No prompts match the current filter.' : 'No prompts yet.'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-[var(--los-border)] flex justify-between text-[9px] font-mono text-[var(--los-muted)]">
        <span>
          {isFiltered ? `${filtered.length} of ${totalCount} prompts` : `${totalCount} prompts`}
        </span>
        <span>{allTags.length} tags</span>
      </div>
    </div>
  );
};
