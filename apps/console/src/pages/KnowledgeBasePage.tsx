import { githubProfileStore } from '@kaihuman/core';
import { StatusBar } from '@kaihuman/ui';
import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import {
  addRawNote,
  existingAgentInstructionFiles,
  isKBInitialized,
  type KBFile,
  listKBDir,
  scaffoldKB,
  updateSkillsIfNeeded,
} from '../lib/github-kb';
import { KB_SKILL_VERSION } from '../lib/kb-skills';

export function KnowledgeBasePage() {
  const repo = githubProfileStore.currentRepo.value;
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [rawFiles, setRawFiles] = useState<KBFile[]>([]);
  const [processedFiles, setProcessedFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scaffolding, setScaffolding] = useState(false);
  const [claudeMdConflict, setClaudeMdConflict] = useState<string[]>([]);
  const [skillsUpdated, setSkillsUpdated] = useState(false);
  const [view, setView] = useState<'inbox' | 'wiki' | 'processed'>('inbox');
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load(fullName: string) {
    setLoading(true);
    setSkillsUpdated(false);
    setRawFiles([]);
    setProcessedFiles([]);
    const init = await isKBInitialized(fullName);
    setInitialized(init);
    if (init) {
      const updated = await updateSkillsIfNeeded(fullName);
      setSkillsUpdated(updated);
      const [raw, processed] = await Promise.all([
        listKBDir(fullName, 'raw'),
        listKBDir(fullName, 'raw/processed'),
      ]);
      setRawFiles(raw);
      setProcessedFiles(processed);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!repo) return;
    const fullName = repo.full_name;
    let cancelled = false;
    setLoading(true);
    setSkillsUpdated(false);
    setRawFiles([]);
    setProcessedFiles([]);

    async function run() {
      const init = await isKBInitialized(fullName);
      if (cancelled) return;
      setInitialized(init);
      if (init) {
        const updated = await updateSkillsIfNeeded(fullName);
        if (cancelled) return;
        setSkillsUpdated(updated);
        const [raw, processed] = await Promise.all([
          listKBDir(fullName, 'raw'),
          listKBDir(fullName, 'raw/processed'),
        ]);
        if (cancelled) return;
        setRawFiles(raw);
        setProcessedFiles(processed);
      }
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [repo?.full_name]);

  async function handleSetup() {
    if (!repo) return;
    const existing = await existingAgentInstructionFiles(repo.full_name);
    if (existing.length > 0) {
      setClaudeMdConflict(existing);
      return;
    }
    await doScaffold(false);
  }

  async function handleAddNote() {
    if (!repo || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const tags = noteTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await addRawNote(repo.full_name, noteTitle.trim() || 'Manual note', noteText.trim(), tags);
      setNoteTitle('');
      setNoteText('');
      setNoteTags('');
      setAddingNote(false);
      const raw = await listKBDir(repo.full_name, 'raw');
      setRawFiles(raw);
    } finally {
      setSubmittingNote(false);
    }
  }

  function handleCopyInstall() {
    const cmd = `mkdir -p ~/.claude/commands && gh api repos/${repo?.full_name}/contents/.claude/commands/kb-session.md --jq '.content' | base64 -d > ~/.claude/commands/kb-session.md`;
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function doScaffold(skipClaudeMd: boolean) {
    if (!repo) return;
    setClaudeMdConflict([]);
    setScaffolding(true);
    try {
      await scaffoldKB(repo.full_name, { skipClaudeMd });
      await load(repo.full_name);
    } finally {
      setScaffolding(false);
    }
  }

  const bar = (
    <StatusBar
      mode="KNOWLEDGE BASE"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
      onWikiClick={() => route('/wiki')}
    />
  );

  if (!repo) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] p-6 text-[var(--los-fg-dim)] text-sm font-mono">
          No repository selected.
        </div>
        {bar}
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] p-6 text-[var(--los-fg-dim)] text-sm font-mono animate-pulse">
          Loading...
        </div>
        {bar}
      </>
    );
  }

  if (!initialized) {
    return (
      <>
        <div class="h-[calc(100vh-2rem)] p-6 font-mono space-y-4 max-w-lg">
          <h1 class="text-lg font-bold text-[var(--los-fg)]">Knowledge Base</h1>
          <p class="text-sm text-[var(--los-fg-dim)]">
            Not set up in <span class="text-[var(--los-accent)]">{repo.full_name}</span>. This
            creates {'·'}
            <code class="text-xs">.kh/</code> and <code class="text-xs">.claude/commands/</code> in
            your repo.
          </p>
          {claudeMdConflict.length > 0 ? (
            <div class="space-y-3">
              <p class="text-xs text-[var(--los-warning)]">
                <code>{claudeMdConflict.join(' and ')}</code> already{' '}
                {claudeMdConflict.length > 1 ? 'exist' : 'exists'} in this repo. Overwrite?
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => doScaffold(false)}
                  class="px-3 py-1.5 bg-[var(--los-accent)] text-black font-bold text-xs rounded hover:opacity-90"
                >
                  Overwrite
                </button>
                <button
                  type="button"
                  onClick={() => doScaffold(true)}
                  class="px-3 py-1.5 border border-[var(--los-border)] text-[var(--los-fg)] text-xs rounded hover:border-[var(--los-accent)]"
                >
                  Keep existing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSetup}
              disabled={scaffolding}
              class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
            >
              {scaffolding ? 'Setting up...' : 'Set Up Knowledge Base'}
            </button>
          )}
        </div>
        {bar}
      </>
    );
  }

  return (
    <>
      <div class="h-[calc(100vh-2rem)] p-4 font-mono flex flex-col gap-4 overflow-hidden">
        <header class="flex items-center justify-between shrink-0">
          <h1 class="text-base font-bold text-[var(--los-fg)]">Knowledge Base</h1>
          <div class="flex items-center gap-3">
            {skillsUpdated && (
              <span class="text-[10px] text-[var(--los-success)]">
                skills updated to v{KB_SKILL_VERSION}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyInstall}
              class="text-[10px] text-[var(--los-fg-dim)] border border-[var(--los-border)] rounded px-2 py-0.5 hover:border-[var(--los-accent)] hover:text-[var(--los-fg)] transition-colors"
            >
              {copied ? 'Copied!' : 'Install /kb-session'}
            </button>
            <span class="text-[10px] text-[var(--los-fg-dim)]">{repo.full_name}</span>
          </div>
        </header>

        <nav class="flex gap-2 text-xs shrink-0">
          {(
            [
              { id: 'inbox', label: 'Inbox', count: rawFiles.length },
              { id: 'wiki', label: 'Wiki', count: null },
              { id: 'processed', label: 'Processed', count: processedFiles.length },
            ] as const
          ).map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              class={`px-3 py-1 rounded border transition-colors ${
                view === id
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                  : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
              }`}
            >
              {count !== null ? `${label} (${count})` : label}
            </button>
          ))}
        </nav>

        <div class="flex-1 overflow-y-auto min-h-0 flex flex-col gap-2">
          {view === 'inbox' ? (
            <>
              {addingNote ? (
                <div class="flex flex-col gap-2 p-3 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]">
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    value={noteTitle}
                    onInput={(e) => setNoteTitle((e.target as HTMLInputElement).value)}
                    class="bg-transparent border border-[var(--los-border)] rounded px-2 py-1 text-xs text-[var(--los-fg)] placeholder:text-[var(--los-fg-dim)] focus:outline-none focus:border-[var(--los-accent)]"
                  />
                  <input
                    type="text"
                    placeholder="Tags (optional, comma-separated — default: general)"
                    value={noteTags}
                    onInput={(e) => setNoteTags((e.target as HTMLInputElement).value)}
                    class="bg-transparent border border-[var(--los-border)] rounded px-2 py-1 text-xs text-[var(--los-fg)] placeholder:text-[var(--los-fg-dim)] focus:outline-none focus:border-[var(--los-accent)]"
                  />
                  <textarea
                    placeholder="Paste or type content..."
                    value={noteText}
                    onInput={(e) => setNoteText((e.target as HTMLTextAreaElement).value)}
                    rows={6}
                    class="bg-transparent border border-[var(--los-border)] rounded px-2 py-1 text-xs text-[var(--los-fg)] placeholder:text-[var(--los-fg-dim)] focus:outline-none focus:border-[var(--los-accent)] resize-none"
                  />
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={submittingNote || !noteText.trim()}
                      class="px-3 py-1 bg-[var(--los-accent)] text-black font-bold text-xs rounded hover:opacity-90 disabled:opacity-50"
                    >
                      {submittingNote ? 'Saving...' : 'Save to inbox'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingNote(false);
                        setNoteTitle('');
                        setNoteText('');
                        setNoteTags('');
                      }}
                      class="px-3 py-1 border border-[var(--los-border)] text-[var(--los-fg-dim)] text-xs rounded hover:border-[var(--los-accent)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingNote(true)}
                  class="self-start px-3 py-1 border border-[var(--los-border)] text-[var(--los-fg-dim)] text-xs rounded hover:border-[var(--los-accent)] hover:text-[var(--los-fg)]"
                >
                  + Add note
                </button>
              )}
              {rawFiles.length === 0 ? (
                <p class="text-xs text-[var(--los-fg-dim)]">
                  No articles pinned yet. Use the browser extension to pin pages.
                </p>
              ) : (
                rawFiles.map((f) => (
                  <div
                    key={f.sha}
                    class="px-3 py-2 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] text-xs text-[var(--los-fg)] truncate"
                  >
                    {f.name.replace(/^\d+-/, '').replace(/\.md$/, '')}
                  </div>
                ))
              )}
            </>
          ) : view === 'wiki' ? (
            <div class="flex flex-col gap-3">
              <p class="text-xs text-[var(--los-fg-dim)]">
                Wiki pages live in <code class="text-xs">.kh/wiki/</code>. Open the wiki to browse
                and read them.
              </p>
              <button
                type="button"
                onClick={() => route('/wiki')}
                class="self-start px-3 py-1.5 bg-[var(--los-accent)] text-black font-bold text-xs rounded hover:opacity-90"
              >
                Open wiki →
              </button>
            </div>
          ) : processedFiles.length === 0 ? (
            <p class="text-xs text-[var(--los-fg-dim)]">
              No processed articles yet. Run <code>/kb-ingest</code> to compile inbox articles.
            </p>
          ) : (
            processedFiles.map((f) => (
              <div
                key={f.sha}
                class="px-3 py-2 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] text-xs text-[var(--los-fg-dim)] truncate"
              >
                {f.name.replace(/^\d+-/, '').replace(/\.md$/, '')}
              </div>
            ))
          )}
        </div>
      </div>
      {bar}
    </>
  );
}
