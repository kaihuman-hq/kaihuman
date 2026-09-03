import { useState } from 'preact/hooks';
import { PINNED_TABS_PATH } from '../background/pinned-tabs';

type Status = 'idle' | 'loading' | 'saving' | 'error';

const plural = (count: number) => `${count} pinned tab${count === 1 ? '' : 's'}`;

interface PinnedTabsPanelProps {
  repo: string;
}

export function PinnedTabsPanel({ repo }: PinnedTabsPanelProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const run = (type: 'LOAD_PINNED_TABS' | 'SAVE_PINNED_TABS') => {
    setStatus(type === 'LOAD_PINNED_TABS' ? 'loading' : 'saving');
    setMessage(null);
    chrome.runtime.sendMessage({ type }, (response) => {
      const error = chrome.runtime.lastError?.message || response?.error;
      if (error) {
        setMessage(error);
        setStatus('error');
        return;
      }
      const count = response?.count ?? 0;
      setMessage(
        type === 'LOAD_PINNED_TABS'
          ? count === 0
            ? 'Already up to date'
            : `Opened ${plural(count)}`
          : `Saved ${plural(count)}`,
      );
      setStatus('idle');
    });
  };

  const busy = status === 'loading' || status === 'saving';

  return (
    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Pinned Tabs</h2>
        <span
          class="text-[10px] text-[var(--los-fg-dim)] line-clamp-1 break-all px-2 py-0.5 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]"
          title={`${repo}/${PINNED_TABS_PATH}`}
        >
          {PINNED_TABS_PATH}
        </span>
      </div>
      <div class="p-3 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] space-y-2">
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => run('LOAD_PINNED_TABS')}
            disabled={busy}
            class="flex-1 py-1.5 px-3 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Loading...' : 'Load'}
          </button>
          <button
            type="button"
            onClick={() => run('SAVE_PINNED_TABS')}
            disabled={busy}
            class="flex-1 py-1.5 px-3 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'saving' ? 'Saving...' : 'Save current'}
          </button>
        </div>
        {message &&
          (status === 'error' ? (
            <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
              {message}
            </div>
          ) : (
            <div class="text-[10px] text-[var(--los-success)]">{message}</div>
          ))}
      </div>
    </section>
  );
}
