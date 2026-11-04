import { githubFileStore } from '@kaihuman/core';
import {
  applyIdeaHandoff,
  asIdeaSlug,
  type IdeaHandoff,
  ideaPath,
  newIdea,
  parseIdeaHandoffs,
  slugifyIdeaTitle,
} from '@kaihuman/formats';
import { StatusBar } from '@kaihuman/ui';
import { ArrowLeft } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { useManifest } from '../hooks/useManifest';
import { createIdeaFile, ideaFileExists, updateIdeaFile } from '../lib/ideas-files';

/** Who wrote a pasted hand-off block: the person, or the chat app it came from. */
const HANDOFF_AUTHORS = ['human', 'claude.ai', 'gemini'] as const;
type HandoffAuthor = (typeof HANDOFF_AUTHORS)[number];

const parseHandoffs = (text: string): { handoffs: IdeaHandoff[]; error: string | null } => {
  try {
    return { handoffs: parseIdeaHandoffs(text), error: null };
  } catch (err) {
    return { handoffs: [], error: err instanceof Error ? err.message : String(err) };
  }
};

/** Applies one hand-off block: an edit of the existing idea when its slug exists, else a new idea. */
async function applyHandoff(handoff: IdeaHandoff, author: HandoffAuthor) {
  const edit = { author, now: new Date() };
  const slug = handoff.slug === undefined ? null : asIdeaSlug(handoff.slug);
  if (slug && ideaFileExists(ideaPath(slug))) {
    await updateIdeaFile(ideaPath(slug), (text) => applyIdeaHandoff(text, handoff, edit).content);
    return `Updated ${slug}`;
  }
  const created = applyIdeaHandoff(null, handoff, edit);
  await createIdeaFile(created.path, created.content);
  return `Created ${created.slug}`;
}

export const QuickIdeaPage = () => {
  useManifest('/manifest-quick-idea.webmanifest');
  const tree = githubFileStore.tree.value;

  const [text, setText] = useState('');
  const [slug, setSlug] = useState('');
  const [author, setAuthor] = useState<HandoffAuthor>('human');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Direct navigation (home-screen shortcut): nothing has loaded the tree yet.
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) githubFileStore.loadTree();
  }, []);

  const { handoffs, error: handoffError } = parseHandoffs(text);
  const isHandoff = handoffs.length > 0 || handoffError !== null;
  const [titleLine = '', ...rest] = text.trim().split('\n');
  const title = titleLine.trim();
  const autoSlug = title ? slugifyIdeaTitle(title) : '';

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (saving || tree.length === 0) return;
    setSaving(true);
    setError(null);
    setDone([]);
    try {
      if (isHandoff) {
        if (handoffError) throw new Error(handoffError);
        const results: string[] = [];
        // One block at a time, so a failing block leaves the earlier ones saved and reported.
        for (const handoff of handoffs) {
          try {
            results.push(await applyHandoff(handoff, author));
          } catch (err) {
            setDone(results);
            throw new Error(
              `${handoff.slug ?? handoff.title ?? 'block'}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        setDone(results);
      } else {
        const idea = newIdea(
          { title, ...(slug.trim() ? { slug: slug.trim() } : {}), braindump: rest.join('\n') },
          { author: 'human', now: new Date() },
        );
        if (ideaFileExists(idea.path)) {
          setSlug(idea.slug);
          throw new Error(
            `An idea with the slug "${idea.slug}" already exists. Pick another slug.`,
          );
        }
        await createIdeaFile(idea.path, idea.content);
        setDone([`Created ${idea.slug}`]);
      }
      setText('');
      setSlug('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && tree.length > 0 && (isHandoff ? !handoffError : title.length > 0);

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
            IDEA
          </span>
          <span class="text-[10px] font-mono text-[var(--los-muted)] opacity-60">.kh/ideas/</span>
        </div>

        {/* Body */}
        <div class="flex-1 flex items-start justify-center pt-16 px-6 overflow-y-auto">
          {tree.length === 0 ? (
            <span class="text-xs text-[var(--los-muted)]">Loading...</span>
          ) : (
            <form onSubmit={handleSubmit} class="w-full max-w-lg flex flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <label
                  for="quick-idea-text"
                  class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                >
                  Idea
                </label>
                <textarea
                  id="quick-idea-text"
                  // biome-ignore lint/a11y/noAutofocus: intentional quick-entry focus
                  autoFocus
                  value={text}
                  onInput={(e) => {
                    setText(e.currentTarget.value);
                    setDone([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
                  }}
                  placeholder={
                    'First line: the title\nThe rest: your braindump\n\n…or paste a kh-idea block from a chat.'
                  }
                  rows={8}
                  class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors resize-y"
                />
                <span class="text-[9px] text-[var(--los-muted)] opacity-50">
                  ⌘↵ or Ctrl+↵ to save
                </span>
              </div>

              {isHandoff ? (
                <div class="flex flex-col gap-2 text-xs">
                  {handoffError ? (
                    <span class="text-[var(--los-warning)]">{handoffError}</span>
                  ) : (
                    <ul class="flex flex-col gap-1 text-[var(--los-muted)]">
                      {handoffs.map((handoff, index) => (
                        <li key={`${index}-${handoff.slug ?? handoff.title}`}>
                          hand-off {index + 1}:{' '}
                          <span class="text-[var(--los-fg)]">
                            {handoff.slug ?? `new · ${handoff.title ?? '(no title)'}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label class="flex items-center gap-2">
                    <span class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
                      Written by
                    </span>
                    <select
                      value={author}
                      onChange={(e) => setAuthor(e.currentTarget.value as HandoffAuthor)}
                      class="bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono"
                    >
                      {HANDOFF_AUTHORS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div class="flex flex-col gap-1.5">
                  <label
                    for="quick-idea-slug"
                    class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                  >
                    Slug (optional)
                  </label>
                  <input
                    id="quick-idea-slug"
                    value={slug}
                    onInput={(e) => setSlug(e.currentTarget.value)}
                    placeholder={autoSlug || 'from the title'}
                    class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-1.5 text-xs font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={!canSave}
                class="py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'SAVING...' : isHandoff ? 'APPLY HAND-OFF' : 'SAVE IDEA'}
              </button>

              {error && (
                <div class="text-xs font-mono text-[var(--los-warning)] text-center py-1 border border-[var(--los-warning)]/30">
                  {error}
                </div>
              )}
              {done.length > 0 && (
                <div class="text-xs font-mono text-[var(--los-accent)] text-center py-1 border border-[var(--los-accent)]/30 bg-[var(--los-accent)]/5">
                  {done.join(' · ')} ·{' '}
                  <button type="button" class="underline" onClick={() => route('/ideas')}>
                    view ideas
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      <StatusBar
        mode="IDEA"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/stream')}
      />
    </>
  );
};
