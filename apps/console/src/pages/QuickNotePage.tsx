import { githubFileStore } from '@kaihuman/core';
import { StatusBar } from '@kaihuman/ui';
import { ArrowLeft } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { useManifest } from '../hooks/useManifest';

export const QuickNotePage = () => {
  useManifest('/manifest-quick-note.webmanifest');
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;
  const appFolder = githubFileStore.appFolder.value;
  const dumpPath = `${appFolder}/dump.md`;

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  // Load tree if needed (direct navigation to /quick-note)
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  // Open dump file once tree is available
  useEffect(() => {
    if (tree.length === 0) return;
    const folder = githubFileStore.appFolder.peek();
    const path = `${folder}/dump.md`;
    const existsInTree = githubFileStore.tree.peek().some((t) => t.path === path);
    if (existsInTree && !githubFileStore.openFiles.peek()[path]) {
      githubFileStore.openFile(path);
    }
  }, [tree.length]);

  const isTreeLoading = tree.length === 0;
  const dumpExistsInTree = tree.some((t) => t.path === dumpPath);
  const isFileLoading = dumpExistsInTree && !openFiles[dumpPath];
  const isLoading = isTreeLoading || isFileLoading;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      const folder = githubFileStore.appFolder.peek();
      const path = `${folder}/dump.md`;
      const existingFile = githubFileStore.openFiles.peek()[path];
      const date = new Date().toISOString().slice(0, 10);
      const newLine = `- ${date} ${trimmed}\n`;
      const newContent = newLine + (existingFile?.content ?? '');

      if (existingFile) {
        githubFileStore.updateFileContent(path, newContent);
        await githubFileStore.saveFile(path);
      } else {
        await githubFileStore.createFile(path, newContent);
      }

      setText('');
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
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
            NOTE
          </span>
          <span class="text-[10px] font-mono text-[var(--los-muted)] opacity-60">{dumpPath}</span>
        </div>

        {/* Body */}
        <div class="flex-1 flex items-start justify-center pt-16 px-6">
          {isLoading ? (
            <span class="text-xs text-[var(--los-muted)]">Loading...</span>
          ) : (
            <form onSubmit={handleSubmit} class="w-full max-w-lg flex flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <label
                  for="quick-note-text"
                  class="text-[10px] text-[var(--los-muted)] uppercase tracking-widest"
                >
                  Note
                </label>
                <textarea
                  id="quick-note-text"
                  // biome-ignore lint/a11y/noAutofocus: intentional quick-entry focus
                  autoFocus
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSubmit(e);
                    }
                  }}
                  placeholder="What's on your mind?"
                  rows={4}
                  class="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors resize-none"
                />
                <span class="text-[9px] text-[var(--los-muted)] opacity-50">
                  ⌘↵ or Ctrl+↵ to save
                </span>
              </div>

              <div class="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!text.trim() || saving}
                  class="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'SAVING...' : 'SAVE NOTE'}
                </button>
              </div>

              {flash && (
                <div class="text-xs font-mono text-[var(--los-accent)] text-center py-1 border border-[var(--los-accent)]/30 bg-[var(--los-accent)]/5">
                  Note saved
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      <StatusBar
        mode="NOTE"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/board')}
      />
    </>
  );
};
