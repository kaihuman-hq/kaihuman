import { CodeEditor, type CodeEditorHandle } from '@cascivo/editor';
import { githubFileStore, Logger } from '@kaihuman/core';
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { languageForPath } from './language';

const logger = new Logger('CodeMirrorEditor');

/** Quiet period after the last user edit before the document is saved. */
export const AUTOSAVE_DEBOUNCE_MS = 3000;

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
  readOnly = false,
}: {
  path?: string;
  zenMode?: boolean;
  initialContent?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  /** No edits and no saving; selecting and copying still work. */
  readOnly?: boolean;
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

  // Synchronous mirrors of the state below: a flush can run in the same tick as
  // an edit or save, before Preact has re-rendered.
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (isUpdatingFromStore.current || readOnly) return; // external sync or read-only, not a user edit
    dirtyRef.current = true;
    setHasUnsavedChanges(true);
    scheduleAutosave();
    if (controlled) {
      onChange?.(value);
      return;
    }
    const currentPath = propsPath || githubFileStore.activeFile.value;
    if (currentPath) githubFileStore.updateFileContent(currentPath, value);
  };

  const handleSave = async (value: string) => {
    if (readOnly) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      if (controlled) {
        await onSave?.(value);
      } else {
        const currentPath = propsPath || githubFileStore.activeFile.value;
        if (currentPath) await githubFileStore.saveFile(currentPath);
      }
      // Keep the dirty flag if the user typed while the save was in flight.
      if (docRef.current === value) {
        dirtyRef.current = false;
        setHasUnsavedChanges(false);
      }
    } catch (e) {
      logger.error('Failed to save:', e);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Debounced auto-save, read through a ref so timers and listeners never
  // close over stale state.
  const stateRef = useRef({ readOnly, handleSave });
  stateRef.current = { readOnly, handleSave };

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  function scheduleAutosave() {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const s = stateRef.current;
      if (s.readOnly || !dirtyRef.current) return;
      if (savingRef.current) {
        scheduleAutosave(); // a save is in flight; try again after another quiet period
        return;
      }
      logger.debug('Auto-saving...');
      s.handleSave(docRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // Save right now if dirty, skipping the debounce.
  const flush = () => {
    clearTimer();
    // The edit must reach IndexedDB even if the save cannot finish before suspension.
    void githubFileStore.flushPendingWrites();
    const s = stateRef.current;
    if (s.readOnly || !dirtyRef.current || savingRef.current) return;
    s.handleSave(docRef.current);
  };

  // Mobile PWAs can be suspended or killed without warning once hidden, so a
  // pending debounce would never fire; flush as soon as the page is hidden.
  // pagehide covers browsers (iOS Safari) that skip visibilitychange on unload.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
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
      dirtyRef.current = false;
      setHasUnsavedChanges(false);
    } else if (content !== docRef.current) {
      syncExternal(content);
      dirtyRef.current = false;
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
        onSave={readOnly ? undefined : handleSave}
        readOnly={readOnly}
        wrap={effectivePath ? effectivePath.endsWith('.md') : true}
        bracketMatching
        theme={zenMode ? ZEN_THEME : undefined}
        className="h-full w-full"
      />

      {/* Save Button Overlay */}
      {!readOnly && (
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
      )}
    </div>
  );
};
