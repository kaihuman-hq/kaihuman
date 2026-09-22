import { useState, useEffect } from 'preact/hooks';
import { ActionLogForm } from './components/ActionLogForm';
import { BookmarkPageForm } from './components/BookmarkPageForm';
import { PinnedTabsPanel } from './components/PinnedTabsPanel';
import './index.css';

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string; tabId: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [dumpNote, setDumpNote] = useState('');
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [repos, setRepos] = useState<{ full_name: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quickNotes, setQuickNotes] = useState<string[]>([]);
  const [selectedNote, setSelectedNote] = useState<string>('.lifeos/dump.md');

  useEffect(() => {
    // Check for auth token, repo, and repos
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo', 'lifeos_repos'], (result) => {
      const storedToken = (result.lifeos_token as string) || null;
      const storedRepo = (result.lifeos_repo as string) || 'lifosy/monorepo';
      const storedRepos = (result.lifeos_repos as { full_name: string }[]) || [];

      setToken(storedToken);
      setActiveRepo(storedRepo);
      setRepos(storedRepos);

      // Fetch fresh repos if we have a token
      if (storedToken) {
        fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: {
            Authorization: `Bearer ${storedToken}`,
            Accept: 'application/vnd.github.v3+json',
          }
        })
          .then(res => {
            if (!res.ok) throw new Error('Failed to fetch repos');
            return res.json();
          })
          .then(data => {
            const fetchedRepos = data.map((r: any) => ({ full_name: r.full_name }));
            setRepos(fetchedRepos);

            chrome.storage.local.set({ lifeos_repos: fetchedRepos });

            // If current active repo is not in the list, default to the first one
            if (fetchedRepos.length > 0 && !fetchedRepos.some((r: any) => r.full_name === storedRepo)) {
              const newDefault = fetchedRepos[0].full_name;
              setActiveRepo(newDefault);
              chrome.storage.local.set({ lifeos_repo: newDefault });
            }
          })
          .catch(err => {
            console.error('Error fetching repos:', err);
          });
      }
    });

    // Get active tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab({
          title: tabs[0].title || '',
          url: tabs[0].url || '',
          tabId: tabs[0].id ?? 0,
        });
      }
    });

    // Fetch quick notes
    chrome.runtime.sendMessage({ type: 'FETCH_QUICK_NOTES' }, (response) => {
      if (response && response.quickNotes) {
        setQuickNotes(response.quickNotes);
      }
    });
  }, []);

  const handleLogin = () => {
    chrome.tabs.create({ url: 'https://app.kaihuman.com/extension-onboarded' }); // Or localhost if dev
  };

  const handleRepoChange = (e: any) => {
    const newRepo = e.target.value;
    setActiveRepo(newRepo);
    chrome.storage.local.set({ lifeos_repo: newRepo });
  };

  const handleReadItLater = async () => {
    if (!token || !activeTab) return;
    setStatus('saving');
    setErrorMessage(null);
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: activeTab.tabId },
        func: () => ({
          title: document.title,
          url:
            (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ||
            window.location.href,
          text: (document.body?.innerText ?? '').trim(),
        }),
      });
      if (!result?.result) throw new Error('Cannot read page content — restricted page?');
      chrome.runtime.sendMessage({ type: 'PIN_ARTICLE', ...result.result }, (response) => {
        if (chrome.runtime.lastError || response?.error) {
          const err = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
          setErrorMessage(err);
          setStatus('error');
        } else {
          setStatus('success');
          setTimeout(() => setStatus('idle'), 2000);
        }
      });
    } catch (e: any) {
      setErrorMessage(e.message || 'Unknown error');
      setStatus('error');
    }
  };

  const handleDumpNote = async () => {
    if (!token || !dumpNote.trim()) return;
    setStatus('saving');
    try {
      setErrorMessage(null);
      chrome.runtime.sendMessage({ type: 'DUMP_NOTE', note: dumpNote, path: selectedNote }, (response) => {
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

  const handleActionLog = async (desc: string, tags: string[]) => {
    if (!token || !desc.trim()) return;
    setStatus('saving');
    try {
      setErrorMessage(null);
      chrome.runtime.sendMessage({
        type: 'ADD_ACTION_LOG',
        description: desc,
        tags: tags,
        path: selectedNote
      }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
          const err = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
          console.error('Error saving action log:', err);
          setErrorMessage(err);
          setStatus('error');
        } else {
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
        <div class="text-xl font-bold tracking-tight">kaihuman</div>
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
        <span class="font-bold text-[var(--los-accent)] tracking-tight">kaihuman</span>
        <div class="flex flex-col items-end gap-1">
          <span class="text-xs text-[var(--los-success)] animate-pulse">● Connected</span>
          {repos.length > 0 ? (
            <select
              value={activeRepo || 'lifosy/monorepo'}
              onChange={handleRepoChange}
              class="text-[10px] text-[var(--los-fg)] font-mono bg-[var(--los-bg)] border border-[var(--los-border)] rounded px-1 py-0.5 max-w-[150px] truncate focus:outline-none focus:border-[var(--los-accent)] cursor-pointer"
            >
              {repos.map(r => (
                <option key={r.full_name} value={r.full_name} class="bg-[var(--los-bg)] text-[var(--los-fg)]">
                  {r.full_name}
                </option>
              ))}
            </select>
          ) : (
            activeRepo && <span class="text-[10px] text-[var(--los-fg-dim)] font-mono">{activeRepo}</span>
          )}
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
              {status === 'saving' ? 'Saving...' : status === 'success' ? 'Saved!' : 'Pin to Knowledge Base'}
            </button>
          </div>
        </section>

        <BookmarkPageForm page={activeTab} repo={activeRepo || 'lifosy/monorepo'} />

        <PinnedTabsPanel repo={activeRepo || 'lifosy/monorepo'} />

        {/* Dump Note Section */}
        <section class="space-y-2 flex flex-col flex-1">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Dump Note</h2>
            {quickNotes.length > 0 ? (
              <select
                value={selectedNote}
                onChange={(e) => setSelectedNote((e.target as HTMLSelectElement).value)}
                class="text-[10px] text-[var(--los-fg-dim)] font-mono bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded px-1 py-0.5 max-w-[150px] truncate focus:outline-none focus:border-[var(--los-accent)] cursor-pointer"
                title={`${activeRepo || 'lifosy/monorepo'}/${selectedNote}`}
              >
                <option value=".lifeos/dump.md" class="bg-[var(--los-bg)]">.lifeos/dump.md</option>
                {quickNotes.map((q) => (
                  <option key={q} value={q} class="bg-[var(--los-bg)]">{q}</option>
                ))}
              </select>
            ) : (
              <span class="text-[10px] text-[var(--los-fg-dim)] line-clamp-1 break-all px-2 py-0.5 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]" title={`${activeRepo || 'lifosy/monorepo'}/${selectedNote}`}>
                {selectedNote}
              </span>
            )}
          </div>

          {selectedNote.endsWith('.actionlog.md') ? (
            <ActionLogForm
              onAdd={handleActionLog}
              status={status}
              errorMessage={errorMessage}
            />
          ) : (
            <>
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
