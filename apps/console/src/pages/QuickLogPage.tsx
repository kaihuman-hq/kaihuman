import { githubFileStore } from '@kaihuman/core';
import { addActionLogEntry } from '@kaihuman/formats';
import type { Slug } from '@kaihuman/formats/business';
import { StatusBar } from '@kaihuman/ui';
import { ArrowLeft } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { useManifest } from '../hooks/useManifest';
import { lineWithTags, STILL_LOADING, writeClientLine } from '../lib/business/capture-write';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeErrorMessage } from '../lib/business/write';

export const QuickLogPage = () => {
  useManifest('/manifest-quick-log.webmanifest');
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;
  const appFolder = githubFileStore.appFolder.value;
  const inboxPath = `${appFolder}/inbox.actionlog.md`;

  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [client, setClient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const business = useBusinessRepo();
  const clients = business.status === 'ready' ? business.data.clients : [];
  // The chosen client can vanish after a repo switch or reload; do not keep writing to it.
  useEffect(() => {
    if (business.status === 'ready' && client && !clients.some((c) => c.slug === client)) {
      setClient('');
    }
  }, [business.status, client, clients]);

  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  useEffect(() => {
    if (tree.length === 0) return;
    const folder = githubFileStore.appFolder.peek();
    const path = `${folder}/inbox.actionlog.md`;
    const existsInTree = githubFileStore.tree.peek().some((t) => t.path === path);
    if (existsInTree) {
      githubFileStore.ensureFresh(path);
    }
  }, [tree.length]);

  const isTreeLoading = tree.length === 0;
  const inboxExistsInTree = tree.some((t) => t.path === inboxPath);
  const isFileLoading = inboxExistsInTree && !openFiles[inboxPath];
  const isLoading = isTreeLoading || isFileLoading;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || saving || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      if (client) {
        if (business.status !== 'ready') {
          setError(STILL_LOADING);
          return;
        }
        const result = await writeClientLine(
          business.repo,
          'log',
          client as Slug,
          lineWithTags(trimmed, tags),
        );
        if (!result.ok) {
          setError(result.issues[0]?.message ?? 'Nothing was saved.');
          return;
        }
        setText('');
        setTags('');
        setFlash(true);
        setTimeout(() => setFlash(false), 1500);
        return;
      }
      const folder = githubFileStore.appFolder.peek();
      const path = `${folder}/inbox.actionlog.md`;
      const existingFile = githubFileStore.openFiles.peek()[path];
      const parsedTags = tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').toLowerCase())
        .filter(Boolean);
      const serialized = addActionLogEntry(existingFile?.content ?? '', {
        description: trimmed,
        tags: parsedTags,
      });
      if (existingFile) {
        githubFileStore.updateFileContent(path, serialized);
        await githubFileStore.saveFile(path);
      } else {
        await githubFileStore.createFile(path, serialized);
      }
      setText('');
      setTags('');
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (err) {
      // Only client writes are caught: the inbox path keeps surfacing errors through the store.
      if (!client) throw err;
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div class="h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] font-mono">
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
            LOG
          </span>
          <span class="text-[10px] font-mono text-[var(--los-muted)] opacity-60">{inboxPath}</span>
        </div>

        <div class="flex-1 flex items-start justify-center pt-16 px-6">
          {isLoading ? (
            <span class="text-xs text-[var(--los-muted)]">Loading...</span>
          ) : (
            <form onSubmit={handleSubmit} class="w-full max-w-lg flex flex-col gap-4">
              {clients.length > 0 && (
                <div class="flex flex-col gap-1.5">
                  <label
                    for="quick-log-client"
                    class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                  >
                    For client <span class="opacity-50 normal-case">(optional)</span>
                  </label>
                  <select
                    id="quick-log-client"
                    value={client}
                    disabled={saving}
                    onChange={(e) => setClient(e.currentTarget.value)}
                    class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
                  >
                    <option value="">None (inbox)</option>
                    {clients.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div class="flex flex-col gap-1.5">
                <label
                  for="quick-log-text"
                  class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                >
                  What happened?
                </label>
                <textarea
                  id="quick-log-text"
                  // biome-ignore lint/a11y/noAutofocus: intentional quick-entry focus
                  autoFocus
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
                  }}
                  placeholder="Describe what happened... #tags inline"
                  rows={3}
                  class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors resize-none"
                />
                <span class="text-[9px] text-[var(--los-muted)] opacity-50">
                  ⌘↵ or Ctrl+↵ to save
                </span>
              </div>

              <div class="flex flex-col gap-1.5">
                <label
                  for="quick-log-tags"
                  class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                >
                  Tags <span class="opacity-50 normal-case">(optional)</span>
                </label>
                <input
                  id="quick-log-tags"
                  type="text"
                  value={tags}
                  onInput={(e) => setTags(e.currentTarget.value)}
                  placeholder="#tag1 #tag2"
                  class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
                />
              </div>

              <div class="flex items-center gap-3 mt-1">
                <button
                  type="submit"
                  disabled={!text.trim() || saving}
                  class="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'SAVING...' : 'LOG IT'}
                </button>
                <button
                  type="button"
                  onClick={() => route('/action-log')}
                  class="px-4 py-2 border border-[var(--los-border)] text-xs font-mono text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)] transition-colors"
                >
                  VIEW LOG →
                </button>
              </div>

              {error && (
                <div role="alert" class="text-xs font-mono text-[var(--los-warning)]">
                  {error}
                </div>
              )}

              {flash && (
                <div class="text-xs font-mono text-[var(--los-accent)] text-center py-1 border border-[var(--los-accent)]/30 bg-[var(--los-accent)]/5">
                  {client ? `Logged for ${client}` : 'Logged'}
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      <StatusBar
        mode="LOG"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/stream')}
      />
    </>
  );
};
