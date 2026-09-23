import { Check, Copy } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { addCommand, commandParameters, fillCommand, parseCommands } from './CommandsLogic';
import { CompactWidgetLayout } from './CompactWidgetLayout';
import { PromptsAddForm } from './PromptsAddForm';

export interface CommandsWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ADD' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
}

const CopyButton = ({
  text,
  copied,
  onCopy,
}: {
  text: string;
  copied: boolean;
  onCopy: () => void;
}) => (
  <button
    type="button"
    title="Copy command"
    onClick={() => {
      navigator.clipboard?.writeText(text).then(onCopy, () => {});
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

/**
 * The command library. In focus, each command with parameters gets a field per `{{name}}` and copies
 * with them filled in; running commands is the desktop palette's job (`>x`), since a browser
 * cannot.
 */
export const CommandsWidget = ({ content, mode, onChange }: CommandsWidgetProps) => {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [values, setValues] = useState<Record<number, Record<string, string>>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const commands = useMemo(() => parseCommands(content), [content]);
  const totalCount = commands.length;

  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    for (const entry of commands) {
      for (const tag of entry.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
    return [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [commands]);

  // The original index travels along, so typed values and copy state survive filtering.
  const filtered = useMemo(() => {
    let result = commands.map((entry, index) => ({ entry, index }));
    if (activeTag) result = result.filter(({ entry }) => entry.tags.includes(activeTag));
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        ({ entry }) =>
          entry.title.toLowerCase().includes(query) ||
          entry.command.toLowerCase().includes(query) ||
          entry.note.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }
    return result;
  }, [commands, activeTag, search]);

  const handleCopy = (index: number) => {
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  };

  const setValue = (index: number, name: string, value: string) =>
    setValues((all) => ({ ...all, [index]: { ...all[index], [name]: value } }));

  if (mode === 'ADD') {
    return (
      <div className="w-full min-h-full p-4">
        <PromptsAddForm
          noun="command"
          onAdd={(title, tags, command) => onChange?.(addCommand(content, title, tags, command))}
        />
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
          COMMANDS
        </MonoText>
      </div>
    );
  }

  // Outside focus there are no parameter fields, so a command copies as written, `{{name}}` and all.
  const compactList = (limit: number) =>
    commands.slice(0, limit).map((entry, index) => (
      <div
        key={`${entry.title}-${index}`}
        className="flex items-center gap-2 border-b border-[var(--los-border)] pb-2 last:border-0 last:pb-0"
      >
        <div className="min-w-0 flex-1">
          <MonoText className="text-xs leading-tight truncate block">{entry.title}</MonoText>
          <MonoText className="text-[9px] text-[var(--los-muted)] truncate block">
            {entry.command.split('\n')[0]}
          </MonoText>
        </div>
        <CopyButton
          text={entry.command}
          copied={copiedIndex === index}
          onCopy={() => handleCopy(index)}
        />
      </div>
    ));

  if (mode === 'MOBILE_EXPANDED' || mode === 'SMALL') {
    const body = (
      <div className="flex flex-col gap-2">
        {compactList(mode === 'SMALL' ? 10 : 6)}
        {totalCount === 0 && (
          <div className="text-[var(--los-muted)] text-[10px] text-center mt-4">
            No commands yet.
          </div>
        )}
      </div>
    );
    if (mode === 'MOBILE_EXPANDED') {
      return (
        <CompactWidgetLayout>
          <div className="flex justify-between items-end shrink-0">
            <MonoHeader className="text-xs text-[var(--los-muted)]">COMMANDS</MonoHeader>
            <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} TOTAL</MonoText>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
        </CompactWidgetLayout>
      );
    }
    return (
      <div className="w-full flex flex-col p-4 relative h-full">
        <div className="flex justify-between items-end mb-2 shrink-0">
          <MonoHeader className="text-sm">COMMANDS</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{totalCount} ITEMS</MonoText>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">{body}</div>
      </div>
    );
  }

  // ── FOCUS mode ──────────────────────────────────────────────────────────────

  const isFiltered = !!activeTag || !!search.trim();

  return (
    <div className="w-full flex flex-col gap-4 p-6 min-h-full overflow-y-auto custom-scrollbar">
      <input
        type="text"
        value={search}
        onInput={(e) => setSearch(e.currentTarget.value)}
        placeholder="Search commands..."
        className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50"
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(({ tag, count }) => (
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
        </div>
      )}

      <div className="flex flex-col gap-4">
        {filtered.map(({ entry, index }) => {
          const parameters = commandParameters(entry.command);
          const typed = values[index] ?? {};
          // A parameter not typed yet stays `{{name}}`, so the preview (and a copy) shows what is
          // missing.
          const filled = fillCommand(
            entry.command,
            Object.fromEntries(Object.entries(typed).filter(([, value]) => value)),
          );
          return (
            <div
              key={`${entry.title}-${index}`}
              className="flex flex-col gap-2 border-b border-[var(--los-border)] pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <MonoText className="text-xs leading-tight break-words">{entry.title}</MonoText>
                  {entry.tags.length > 0 && (
                    <MonoText className="text-[9px] text-[var(--los-accent)] opacity-70 block">
                      {entry.tags.map((tag) => `#${tag}`).join(' ')}
                    </MonoText>
                  )}
                </div>
                <CopyButton
                  text={filled}
                  copied={copiedIndex === index}
                  onCopy={() => handleCopy(index)}
                />
              </div>
              {entry.note && (
                <MonoText className="text-[10px] text-[var(--los-muted)] whitespace-pre-wrap">
                  {entry.note}
                </MonoText>
              )}
              {parameters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {parameters.map((name) => (
                    <input
                      key={name}
                      type="text"
                      aria-label={`Value for ${name}`}
                      value={typed[name] ?? ''}
                      onInput={(e) => setValue(index, name, e.currentTarget.value)}
                      placeholder={name}
                      className="flex-1 min-w-[8rem] bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-[11px] font-mono text-[var(--los-fg)] focus:outline-none"
                    />
                  ))}
                </div>
              )}
              <pre className="text-[11px] font-mono text-[var(--los-fg)] whitespace-pre-wrap break-words bg-[var(--los-bg)] border border-[var(--los-border)] p-2">
                {filled}
              </pre>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-[var(--los-muted)] text-[10px] text-center py-8">
            {isFiltered ? 'No commands match the current filter.' : 'No commands yet.'}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--los-border)] flex justify-between text-[9px] font-mono text-[var(--los-muted)]">
        <span>
          {isFiltered ? `${filtered.length} of ${totalCount} commands` : `${totalCount} commands`}
        </span>
        <span>run them from the desktop palette: &gt;x</span>
      </div>
    </div>
  );
};
