import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
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
          // Save command?
          {
            key: "Mod-s",
            run: (view) => {
              // Re-read path at time of save
              const currentPath = propsPath || githubFileStore.activeFile.value;
              if (currentPath) {
                githubFileStore.saveFile(currentPath);
              }
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

    // If path changed or content changed externally (and we are not the ones who changed it? Store updates on local edit too)
    // Store `updateFileContent` sets value.
    // We need to distinguish between "store updated because WE typed" vs "store updated because FILE switched or FETCHED".

    // Simplest: only update doc if path changes or if content is significantly different (like hard reload).
    // If we type, store updates. If we update view from store, we reset cursor.
    // Solution: Track path changes.

    if (effectivePath !== currentPathRef.current) {
      currentPathRef.current = effectivePath;
      const currentDoc = view.state.doc.toString();
      if (content !== currentDoc) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: content || '' }
        });
      }
    } else {
      // Path is same. Did content change from OUTSIDE?
      // E.g. fetch finished.
      // If the store content is different from editor content, sync it.
      // But if we just typed it, it should be same.
      // Note: Signals update synchronously? 
      // If we type -> `updateListener` -> `updateFileContent` -> `currentContent` signal updates -> this effect runs.
      // content == view.state.doc.toString(). So harmless.

      // Check if we are "dirty" effectively?
      // Actually, if we use `updateFileContent`, the store matches the editor.
      // If we load a file, store changes, effect runs, path check handles it.
      // What if we SAVE and SHA changes? Content doesn't change.
      // What if we Revert? 

      // Re-check content just in case
      const doc = view.state.doc.toString();
      if (content !== doc && content !== null) {
        view.dispatch({
          changes: { from: 0, to: doc.length, insert: content }
        });
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

  return <div ref={parentRef} class="h-full w-full overflow-hidden" />;
};
