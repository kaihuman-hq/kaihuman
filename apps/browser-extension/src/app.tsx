import { useState, useEffect } from 'preact/hooks';
import './index.css';

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [dumpNote, setDumpNote] = useState('');
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check for auth token and repo
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], (result) => {
      setToken((result.lifeos_token as string) || null);
      setActiveRepo((result.lifeos_repo as string) || 'lifosy/monorepo');
    });

    // Get active tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab({
          title: tabs[0].title || '',
          url: tabs[0].url || '',
        });
      }
    });
  }, []);

  const handleLogin = () => {
    chrome.tabs.create({ url: 'https://app.lifosy.com' }); // Or localhost if dev
  };

  const handleReadItLater = async () => {
    if (!token || !activeTab) return;
    setStatus('saving');
    // Simulate API call
    setTimeout(() => {
      console.log('Saved to Read-it-later:', activeTab);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    }, 1000);
  };

  const handleDumpNote = async () => {
    if (!token || !dumpNote.trim()) return;
    setStatus('saving');
    try {
      setErrorMessage(null);
      chrome.runtime.sendMessage({ type: 'DUMP_NOTE', note: dumpNote }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
          const err = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
          console.error('Error saving dump note:', err);
          setErrorMessage(err);
          setStatus('error');
        } else {
          setDumpNote('');
          setStatus('success');
          setTimeout(() => setStatus('idle'), 2000);
        }
      });
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || 'Unknown error');
      setStatus('error');
    }
  };

  if (!token) {
    return (
      <div class="life-os-root w-[350px] min-h-[480px] bg-[var(--los-bg)] text-[var(--los-fg)] p-6 flex flex-col items-center justify-center space-y-4 font-mono">
        <div class="text-xl font-bold tracking-tight">Lifosy</div>
        <p class="text-center text-[var(--los-fg-dim)] text-sm">Please login to the console to use the extension.</p>
        <button
          onClick={handleLogin}
          class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold rounded hover:opacity-90 transition-opacity"
        >
          Open Console
        </button>
      </div>
    );
  }

  return (
    <div class="life-os-root w-[350px] min-h-[480px] bg-[var(--los-bg)] text-[var(--los-fg)] p-4 font-mono flex flex-col">
      <header class="flex items-center justify-between mb-4 pb-2 border-b border-[var(--los-border)]">
        <span class="font-bold text-[var(--los-accent)] tracking-tight">Lifosy</span>
        <div class="flex flex-col items-end">
          <span class="text-xs text-[var(--los-success)] animate-pulse">● Connected</span>
          {activeRepo && <span class="text-[10px] text-[var(--los-fg-dim)] font-mono">{activeRepo}</span>}
        </div>
      </header>

      <div class="space-y-6 flex-1">
        {/* Read It Later Section */}
        <section class="space-y-2">
          <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Read It Later</h2>
          <div class="p-3 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]">
            <div class="text-xs text-[var(--los-fg-dim)] line-clamp-2 mb-2">{activeTab?.title || 'No active tab'}</div>
            <button
              onClick={handleReadItLater}
              disabled={status === 'saving'}
              class="w-full py-1.5 px-3 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors flex items-center justify-center gap-2"
            >
              {status === 'saving' ? 'Saving...' : status === 'success' ? 'Saved!' : 'Save Page'}
            </button>
          </div>
        </section>

        {/* Dump Note Section */}
        <section class="space-y-2 flex flex-col flex-1">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Dump Note</h2>
            <span class="text-[10px] text-[var(--los-fg-dim)] line-clamp-1 break-all px-2 py-0.5 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]" title={`${activeRepo || 'lifosy/monorepo'}/.lifeos/dump.md`}>
              .lifeos/dump.md
            </span>
          </div>
          <textarea
            value={dumpNote}
            onInput={(e) => setDumpNote((e.target as HTMLTextAreaElement).value)}
            class="w-full min-h-[120px] bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none resize-none"
            placeholder="Type manually..."
          />
          {status === 'error' && errorMessage && (
            <div class="text-[10px] text-red-400 mt-1 mb-1 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
              {errorMessage}
            </div>
          )}
          <button
            onClick={handleDumpNote}
            disabled={status === 'saving' || !dumpNote.trim()}
            class="w-full py-2 px-3 bg-[var(--los-accent)] text-black hover:opacity-90 font-bold text-xs rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            Add Note
          </button>
        </section>
      </div>
    </div>
  );
}
