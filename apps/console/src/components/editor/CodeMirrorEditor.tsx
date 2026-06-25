import { CodeEditor, type CodeEditorHandle } from '@cascivo/editor';
import { githubFileStore, Logger } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { languageForPath } from './language';

const logger = new Logger('CodeMirrorEditor');

// Zen-mode overrides — a partial map of --cascivo-editor-* props that Cascivo
// spreads onto the editor root and re-applies live when the object changes.
const ZEN_THEME = {
  '--cascivo-editor-bg': '#0c0a09',
  '--cascivo-editor-fg': '#a8a29e',
  '--cascivo-editor-gutter-bg': '#0c0a09',
  '--cascivo-editor-gutter-fg': '#44403c',
  '--cascivo-editor-current-line': 'rgba(56, 189, 248, 0.08)',
} as const;

export const CodeMirrorEditor = ({
  path: propsPath,
  zenMode,
  initialContent,
  onChange,
  onSave,
}: {
  path?: string;
  zenMode?: boolean;
  initialContent?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
}) => {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  // Latest editor text — kept current via onValueChange so external syncs can
  // compute the replace range without a getValue() on the handle.
  const docRef = useRef(initialContent ?? '');
  // Set while applying an external (store/prop) change so the resulting
  // onValueChange does not echo back into the store. applyEdit is synchronous,
  // so this flag is safe to clear right after the call.
  const isUpdatingFromStore = useRef(false);
  const currentPathRef = useRef<string | null>(null);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const controlled = initialContent !== undefined;

  // Replace the whole document via the undoable handle, guarding the echo.
  const syncExternal = (next: string) => {
    const view = editorRef.current;
    if (!view || next === docRef.current) return;
    isUpdatingFromStore.current = true;
    try {
      view.applyEdit({ from: 0, to: docRef.current.length }, next);
      docRef.current = next;
    } finally {
      isUpdatingFromStore.current = false;
    }
  };

  const handleChange = (value: string) => {
    docRef.current = value;
    if (isUpdatingFromStore.current) return; // external sync, not a user edit
    setHasUnsavedChanges(true);
    if (controlled) {
      onChange?.(value);
      return;
    }
    const currentPath = propsPath || githubFileStore.activeFile.value;
    if (currentPath) githubFileStore.updateFileContent(currentPath, value);
  };

  const handleSave = async (value: string) => {
    setIsSaving(true);
    try {
      if (controlled) {
        await onSave?.(value);
      } else {
        const currentPath = propsPath || githubFileStore.activeFile.value;
        if (currentPath) await githubFileStore.saveFile(currentPath);
      }
      setHasUnsavedChanges(false);
    } catch (e) {
      logger.error('Failed to save:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save every 2 minutes when dirty — read through a ref so the interval
  // never closes over stale state.
  const stateRef = useRef({ hasUnsavedChanges, isSaving, handleSave });
  stateRef.current = { hasUnsavedChanges, isSaving, handleSave };
  useEffect(() => {
    const id = setInterval(
      () => {
        const s = stateRef.current;
        if (s.hasUnsavedChanges && !s.isSaving) {
          logger.debug('Auto-saving...');
          s.handleSave(docRef.current);
        }
      },
      2 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  // Controlled mode: sync when the parent pushes new content (e.g. a late
  // contentOverride or decrypted plaintext).
  useEffect(() => {
    if (initialContent !== undefined) syncExternal(initialContent);
  }, [initialContent]);

  // Store mode: follow the active file's content (path switch or remote pull).
  useSignalEffect(() => {
    if (initialContent !== undefined) return; // controlled — skip store sync
    const effectivePath = propsPath || githubFileStore.activeFile.value;
    const content = effectivePath
      ? (githubFileStore.openFiles.value[effectivePath]?.content ?? '')
      : '';
    if (!effectivePath) return;

    if (effectivePath !== currentPathRef.current) {
      currentPathRef.current = effectivePath;
      syncExternal(content);
      setHasUnsavedChanges(false);
    } else if (content !== docRef.current) {
      syncExternal(content);
      setHasUnsavedChanges(false);
    }
  });

  if (!propsPath && !githubFileStore.activeFile.value && initialContent === undefined) {
    return (
      <div class="h-full flex items-center justify-center text-nexus-muted">
        Select a file to edit
      </div>
    );
  }

  const effectivePath = propsPath || githubFileStore.activeFile.value;

  return (
    <div className="h-full w-full relative group">
      <CodeEditor
        ref={editorRef}
        language={languageForPath(effectivePath)}
        defaultValue={docRef.current}
        onValueChange={handleChange}
        onSave={handleSave}
        wrap={effectivePath ? effectivePath.endsWith('.md') : true}
        bracketMatching
        theme={zenMode ? ZEN_THEME : undefined}
        className="h-full w-full"
      />

      {/* Save Button Overlay */}
      <div
        className={`absolute top-4 right-8 transition-opacity duration-300 ${hasUnsavedChanges ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          type="button"
          onClick={() => handleSave(docRef.current)}
          disabled={isSaving}
          className="bg-[var(--los-accent)] text-black px-4 py-1.5 rounded-sm shadow-lg text-xs font-bold font-mono tracking-wider hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              SAVING...
            </>
          ) : (
            'SAVE CHANGES'
          )}
        </button>
      </div>
    </div>
  );
};
