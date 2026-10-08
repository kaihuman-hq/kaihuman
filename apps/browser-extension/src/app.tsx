import { useState, useEffect } from 'preact/hooks';
import { CONSOLE_URL } from './console';
import { ActionLogForm } from './components/ActionLogForm';
import { BookmarkPageForm } from './components/BookmarkPageForm';
import { QuickActions } from './components/QuickActions';
import { PinnedTabsPanel } from './components/PinnedTabsPanel';
import { imagesEnabled, KB_IMAGES_SETTING } from './background/kb-capture';
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
  // The star opens a view of its own rather than growing the popup with another form.
  const [view, setView] = useState<'main' | 'bookmark'>('main');
  const [downloadImages, setDownloadImages] = useState(true);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'failed'>('idle');

  useEffect(() => {
    chrome.storage.local.get([KB_IMAGES_SETTING], (result) => {
      setDownloadImages(imagesEnabled(result[KB_IMAGES_SETTING]));
    });

    // Check for auth token, repo, and repos
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo', 'lifeos_repos'], (result) => {
      const storedToken = (result.lifeos_token as string) || null;
      const storedRepo = (result.lifeos_repo as string) || 'kaihuman-hq/kaihuman';
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

    // Opening the popup is the other moment the extension checks GitHub. The worker still holds
    // to its hourly budget, so this is a no-op on a cache that is still fresh.
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('LifeOS Extension: sync check failed', chrome.runtime.lastError.message);
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
    chrome.tabs.create({ url: `${CONSOLE_URL}/extension-onboarded` }); // Or localhost if dev
  };

  // A popup cannot follow a link without navigating itself, so the title opens the app in a tab.
  const handleOpenConsole = () => {
    chrome.tabs.create({ url: CONSOLE_URL });
  };

  // Opening the popup already checks, but only within the hourly budget. Asking outright is not
  // background traffic, so this one ignores it.
  const handleSyncNow = () => {
    setSyncState('syncing');
    chrome.runtime.sendMessage({ type: 'SYNC_NOW', force: true }, (response) => {
      const failure = chrome.runtime.lastError?.message || response?.error;
      setSyncState(failure ? 'failed' : 'done');
      setTimeout(() => setSyncState('idle'), 2000);
    });
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
      // The content script converts the page to Markdown; tabs opened before the extension was
      // installed have no content script, so those fall back to plain text.
      const article = await chrome.tabs
        .sendMessage(activeTab.tabId, { type: 'EXTRACT_ARTICLE' })
        .catch(async () => {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: activeTab.tabId },
            func: () => ({
              title: document.title,
              url: '',
              text: (document.body?.innerText ?? '').trim(),
              images: [],
            }),
          });
          return result?.result;
        });
      if (!article) throw new Error('Cannot read page content — restricted page?');
      const pinned = { ...article, url: article.url || activeTab.url };
      chrome.runtime.sendMessage({ type: 'PIN_ARTICLE', ...pinned }, (response) => {
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

  // Only the link and title go to the read-later list, so unlike pinning there is no page to read.
  const handleSaveForLater = () => {
    if (!token || !activeTab) return;
    setStatus('saving');
    setErrorMessage(null);
    chrome.runtime.sendMessage(
      { type: 'READ_LATER_ADD', url: activeTab.url, title: activeTab.title },
      (response) => {
        if (chrome.runtime.lastError || response?.error) {
          setErrorMessage(chrome.runtime.lastError?.message || response?.error || 'Unknown error');
          setStatus('error');
        } else {
          setStatus('success');
          setTimeout(() => setStatus('idle'), 2000);
        }
      },
    );
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

  if (view === 'bookmark') {
    return (
      <div class="life-os-root w-[350px] min-h-[480px] bg-[var(--los-bg)] text-[var(--los-fg)] p-4 font-mono flex flex-col">
        <BookmarkPageForm
          page={activeTab}
          repo={activeRepo || 'kaihuman-hq/kaihuman'}
          onClose={() => setView('main')}
        />
      </div>
    );
  }

  return (
    <div class="life-os-root w-[350px] min-h-[480px] bg-[var(--los-bg)] text-[var(--los-fg)] p-4 font-mono flex flex-col">
      <header class="flex items-center justify-between mb-4 pb-2 border-b border-[var(--los-border)]">
        <button
          type="button"
          onClick={handleOpenConsole}
          class="flex items-center gap-2 font-bold text-[var(--los-accent)] tracking-tight hover:underline"
          title={`Open ${CONSOLE_URL}`}
        >
          <img src="/icon.svg" alt="" class="w-5 h-5 rounded" />
          kaihuman
        </button>
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncState === 'syncing'}
              class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-accent)] disabled:opacity-50 transition-colors"
              title="Fetch from GitHub and push what has been counted, ignoring the hourly budget"
            >
              {syncState === 'syncing'
                ? 'Syncing…'
                : syncState === 'done'
                  ? 'Synced'
                  : syncState === 'failed'
                    ? 'Sync failed'
                    : '↻ Sync now'}
            </button>
            <span class="text-xs text-[var(--los-success)] animate-pulse">● Connected</span>
          </div>
          {repos.length > 0 ? (
            <select
              value={activeRepo || 'kaihuman-hq/kaihuman'}
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
        <QuickActions
          pageTitle={activeTab?.title || ''}
          onPin={handleReadItLater}
          onBookmark={() => setView('bookmark')}
          onReadLater={handleSaveForLater}
          status={status}
        />
        <label class="flex items-center gap-2 text-[10px] text-[var(--los-fg-dim)] font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={downloadImages}
            onChange={(e) => {
              const enabled = (e.target as HTMLInputElement).checked;
              setDownloadImages(enabled);
              chrome.storage.local.set({ [KB_IMAGES_SETTING]: enabled });
            }}
          />
          Save page images with pinned pages
        </label>

        {status === 'error' && errorMessage && (
          <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
            {errorMessage}
          </div>
        )}

        <PinnedTabsPanel repo={activeRepo || 'kaihuman-hq/kaihuman'} />

        {/* Dump Note Section */}
        <section class="space-y-2 flex flex-col flex-1">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Dump Note</h2>
            {quickNotes.length > 0 ? (
              <select
                value={selectedNote}
                onChange={(e) => setSelectedNote((e.target as HTMLSelectElement).value)}
                class="text-[10px] text-[var(--los-fg-dim)] font-mono bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded px-1 py-0.5 max-w-[150px] truncate focus:outline-none focus:border-[var(--los-accent)] cursor-pointer"
                title={`${activeRepo || 'kaihuman-hq/kaihuman'}/${selectedNote}`}
              >
                <option value=".lifeos/dump.md" class="bg-[var(--los-bg)]">.lifeos/dump.md</option>
                {quickNotes.map((q) => (
                  <option key={q} value={q} class="bg-[var(--los-bg)]">{q}</option>
                ))}
              </select>
            ) : (
              <span class="text-[10px] text-[var(--los-fg-dim)] line-clamp-1 break-all px-2 py-0.5 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]" title={`${activeRepo || 'kaihuman-hq/kaihuman'}/${selectedNote}`}>
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
