import { githubProfileStore } from '@kaihuman/core';
import { StatusBar } from '@kaihuman/ui';
import { ArrowLeft } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { route } from 'preact-router';
import { useManifest } from '../hooks/useManifest';
import { addRawNote } from '../lib/github-kb';

export const QuickKnowledgePage = () => {
  useManifest('/manifest-quick-knowledge.webmanifest');
  const repo = githubProfileStore.currentRepo.value;

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || saving || !repo) return;

    setSaving(true);
    setError(null);
    try {
      // Zero required structure — the first line becomes the title, the whole
      // text is the body. Ingestion classifies and tags it later.
      const title = (trimmed.split('\n')[0] ?? trimmed).slice(0, 80);
      await addRawNote(repo.full_name, title, trimmed);
      setText('');
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div class="h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] font-mono">
        {/* Header */}
        <div class="h-14 border-b border-[var(--los-border)] flex items-center gap-4 px-6 shrink-0">
          <button
            type="button"
            onClick={() => route('/')}
            class="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            <ArrowLeft size={14} />
            <span class="text-xs font-mono">BACK</span>
          </button>
          <div class="h-4 w-px bg-[var(--los-border)]" />
          <span class="text-sm font-mono font-bold tracking-widest text-[var(--los-accent)]">
            KNOWLEDGE
          </span>
          <span class="text-[10px] font-mono text-[var(--los-muted)] opacity-60">.kh/raw/</span>
        </div>

        {/* Body */}
        <div class="flex-1 flex items-start justify-center pt-16 px-6">
          {!repo ? (
            <span class="text-xs text-[var(--los-muted)]">
              Select a repository in the app first, then return here.
            </span>
          ) : (
            <form onSubmit={handleSubmit} class="w-full max-w-lg flex flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <label
                  for="quick-knowledge-text"
                  class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                >
                  Something you learned
                </label>
                <textarea
                  id="quick-knowledge-text"
                  // biome-ignore lint/a11y/noAutofocus: intentional quick-entry focus
                  autoFocus
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Anything — a fact, a snippet, a lesson. No structure needed."
                  rows={6}
                  class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors resize-none"
                />
                <span class="text-[9px] text-[var(--los-muted)] opacity-50">
                  ⌘↵ or Ctrl+↵ to save · compiled into the wiki by /kb-ingest
                </span>
              </div>

              <div class="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!text.trim() || saving}
                  class="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'SAVING...' : 'SAVE TO KNOWLEDGE'}
                </button>
              </div>

              {flash && (
                <div class="text-xs font-mono text-[var(--los-accent)] text-center py-1 border border-[var(--los-accent)]/30 bg-[var(--los-accent)]/5">
                  Saved to inbox
                </div>
              )}
              {error && (
                <div class="text-xs font-mono text-[var(--los-warning)] text-center py-1 border border-[var(--los-warning)]/30">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      <StatusBar
        mode="KNOWLEDGE"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/board')}
      />
    </>
  );
};
