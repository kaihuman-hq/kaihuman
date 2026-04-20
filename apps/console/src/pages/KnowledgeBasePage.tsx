import { githubProfileStore } from '@lifosy/core';
import { useEffect, useState } from 'preact/hooks';
import {
  addRawNote,
  claudeMdExists,
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
  const [wikiFiles, setWikiFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scaffolding, setScaffolding] = useState(false);
  const [claudeMdConflict, setClaudeMdConflict] = useState(false);
  const [skillsUpdated, setSkillsUpdated] = useState(false);
  const [view, setView] = useState<'inbox' | 'wiki'>('inbox');
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  async function load(fullName: string) {
    setLoading(true);
    setSkillsUpdated(false);
    setRawFiles([]);
    setWikiFiles([]);
    const init = await isKBInitialized(fullName);
    setInitialized(init);
    if (init) {
      const updated = await updateSkillsIfNeeded(fullName);
      setSkillsUpdated(updated);
      const [raw, wiki] = await Promise.all([
        listKBDir(fullName, 'raw'),
        listKBDir(fullName, 'wiki'),
      ]);
      setRawFiles(raw);
      setWikiFiles(wiki);
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
    setWikiFiles([]);

    async function run() {
      const init = await isKBInitialized(fullName);
      if (cancelled) return;
      setInitialized(init);
      if (init) {
        const updated = await updateSkillsIfNeeded(fullName);
        if (cancelled) return;
        setSkillsUpdated(updated);
        const [raw, wiki] = await Promise.all([
          listKBDir(fullName, 'raw'),
          listKBDir(fullName, 'wiki'),
        ]);
        if (cancelled) return;
        setRawFiles(raw);
        setWikiFiles(wiki);
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
    const hasClaudeMd = await claudeMdExists(repo.full_name);
    if (hasClaudeMd) {
      setClaudeMdConflict(true);
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

  async function doScaffold(skipClaudeMd: boolean) {
    if (!repo) return;
    setClaudeMdConflict(false);
    setScaffolding(true);
    try {
      await scaffoldKB(repo.full_name, { skipClaudeMd });
      await load(repo.full_name);
    } finally {
      setScaffolding(false);
    }
  }

  if (!repo) {
    return (
      <div class="p-6 text-[var(--los-fg-dim)] text-sm font-mono">No repository selected.</div>
    );
  }

  if (loading) {
    return (
      <div class="p-6 text-[var(--los-fg-dim)] text-sm font-mono animate-pulse">Loading...</div>
    );
  }

  if (!initialized) {
    return (
      <div class="p-6 font-mono space-y-4 max-w-lg">
        <h1 class="text-lg font-bold text-[var(--los-fg)]">Knowledge Base</h1>
        <p class="text-sm text-[var(--los-fg-dim)]">
          Not set up in <span class="text-[var(--los-accent)]">{repo.full_name}</span>. This creates
          {'·'}
          <code class="text-xs">.kh/</code> and <code class="text-xs">.claude/commands/</code> in
          your repo.
        </p>
        {claudeMdConflict ? (
          <div class="space-y-3">
            <p class="text-xs text-[var(--los-warning)]">
              A <code>CLAUDE.md</code> already exists in this repo. Overwrite it?
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
    );
  }

  return (
    <div class="p-4 font-mono flex flex-col gap-4 h-full overflow-hidden">
      <header class="flex items-center justify-between shrink-0">
        <h1 class="text-base font-bold text-[var(--los-fg)]">Knowledge Base</h1>
        <div class="flex items-center gap-3">
          {skillsUpdated && (
            <span class="text-[10px] text-[var(--los-success)]">
              skills updated to v{KB_SKILL_VERSION}
            </span>
          )}
          <span class="text-[10px] text-[var(--los-fg-dim)]">{repo.full_name}</span>
        </div>
      </header>

      <nav class="flex gap-2 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setView('inbox')}
          class={`px-3 py-1 rounded border transition-colors ${
            view === 'inbox'
              ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
              : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
          }`}
        >
          Inbox ({rawFiles.length})
        </button>
        <button
          type="button"
          onClick={() => setView('wiki')}
          class={`px-3 py-1 rounded border transition-colors ${
            view === 'wiki'
              ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
              : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
          }`}
        >
          Wiki ({wikiFiles.length})
        </button>
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
        ) : wikiFiles.length === 0 ? (
          <p class="text-xs text-[var(--los-fg-dim)]">
            No wiki pages yet. Run <code>/kb-ingest</code> in Claude Code to compile articles.
          </p>
        ) : (
          wikiFiles.map((f) => (
            <div
              key={f.sha}
              class="px-3 py-2 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] text-xs text-[var(--los-fg)] truncate"
            >
              {f.name.replace(/\.md$/, '')}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
