import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

// Theme customization to match Nexus
const nexusTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "#e2e8f0" // text-nexus-text (slate-200 approx)
  },
  ".cm-content": {
    caretColor: "#38bdf8", // nexus-primary (sky-400)
    fontFamily: "JetBrains Mono, monospace" // Ensure mono font
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#475569", // nexus-muted (slate-600)
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(56, 189, 248, 0.1)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(56, 189, 248, 0.05)"
  }
}, { dark: true });

export const CodeMirrorEditor = ({ path: propsPath }: { path?: string }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Track active file to handle switching content
  const currentPathRef = useRef<string | null>(null);

  // Local state for tracking dirty status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to save
  const handleSave = async () => {
    const currentPath = propsPath || githubFileStore.activeFile.value;
    if (currentPath) {
      console.log('[CodeMirrorEditor] Saving file:', currentPath);
      setIsSaving(true);
      try {
        await githubFileStore.saveFile(currentPath);
        setHasUnsavedChanges(false);
      } catch (e) {
        console.error('Failed to save:', e);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Auto-save interval (2 minutes)
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (hasUnsavedChanges && !isSaving) {
        console.log('[CodeMirrorEditor] Auto-saving...');
        handleSave();
      }
    }, 2 * 60 * 1000); // 2 minutes

    return () => clearInterval(intervalId);
  }, [hasUnsavedChanges, isSaving]); // Re-create interval if status changes? No, closure captures state? 
  // Actually, intervals with closures can be tricky.
  // Better to use ref for state or functional update, or just depend on [hasUnsavedChanges] (which resets timer on change - acceptable or not?)
  // Resetting timer on every keystroke (hasUnsavedChanges true->true) is not ideal if we want strict "every 2 min".
  // But if we toggle false->true (first change), timer starts.
  // If we toggle true->false (save), timer stops.
  // This essentially means "Auto-save 2 mins after the FIRST change". 
  // If I want "Check every 2 mins", I should start interval on mount and use Ref for checking state.

  const stateRef = useRef({ hasUnsavedChanges, isSaving });
  stateRef.current = { hasUnsavedChanges, isSaving };

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (stateRef.current.hasUnsavedChanges && !stateRef.current.isSaving) {
        console.log('[CodeMirrorEditor] Auto-saving...');
        handleSave();
      }
    }, 2 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []); // Run once on mount

  // Initial setup
  useEffect(() => {
    // Determine effective path (prop takes precedence, though usually one or other is used)
    const initialPath = propsPath || githubFileStore.activeFile.value;

    console.error('[CodeMirrorEditor] Mounting. Path:', initialPath, 'Ref:', parentRef.current);
    if (!parentRef.current) return;

    const startState = EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          // Save command
          {
            key: "Mod-s",
            run: (view) => {
              handleSave();
              return true;
            }
          }
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle), // Or oneDark highlight style?
        oneDark, // Base theme
        nexusTheme, // Overrides
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // Update store for the CORRECT path
            const currentPath = propsPath || githubFileStore.activeFile.value;
            if (currentPath) {
              githubFileStore.updateFileContent(currentPath, update.state.doc.toString());
              // Mark as dirty
              setHasUnsavedChanges(true); // This might cause re-renders? That's fine for the button.
            }
          }
        })
      ]
    });

    const view = new EditorView({
      state: startState,
      parent: parentRef.current
    });

    viewRef.current = view;

    // Reset unsaved changes on load?
    // If we load a file, it's clean initially.
    setHasUnsavedChanges(false);

    return () => {
      view.destroy();
    };
  }, [propsPath]); // Re-mount if props.path changes? Usually it won't change for same component instance.

  // Sync content with store
  useSignalEffect(() => {
    const effectivePath = propsPath || githubFileStore.activeFile.value;

    // Get content from OPEN files map directly
    const content = effectivePath ? (githubFileStore.openFiles.value[effectivePath]?.content || '') : '';

    const view = viewRef.current;

    if (!view || !effectivePath) return;

    // Logic to update view if content changed EXTERNALLY
    if (effectivePath !== currentPathRef.current) {
      currentPathRef.current = effectivePath;
      const currentDoc = view.state.doc.toString();
      if (content !== currentDoc) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: content || '' }
        });
        // New file loaded -> clean state
        setHasUnsavedChanges(false);
      }
    } else {
      // Path is same. 
      // If content matches doc, we are good.
      // If content differs, it means external update (e.g. pull).
      const doc = view.state.doc.toString();
      if (content !== doc && content !== null) {
        view.dispatch({
          changes: { from: 0, to: doc.length, insert: content }
        });
        // External update -> Reset dirty? Or keep dirty if we had changes?
        // Usually external update overwrites, so we are now "in sync" with that version (but maybe that version is unsaved?)
        // Let's assume external update means we accept it.
        setHasUnsavedChanges(false);
      }
    }
  });

  if (!propsPath && !githubFileStore.activeFile.value) {
    return (
      <div class="h-full flex items-center justify-center text-nexus-muted">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="h-full w-full relative group">
      <div ref={parentRef} class="h-full w-full overflow-hidden" />

      {/* Save Button Overlay */}
      <div className={`absolute top-4 right-8 transition-opacity duration-300 ${hasUnsavedChanges ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[var(--los-accent)] text-black px-4 py-1.5 rounded-sm shadow-lg text-xs font-bold font-mono tracking-wider hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              SAVING...
            </>
          ) : (
            "SAVE CHANGES"
          )}
        </button>
      </div>
    </div>
  );
};
