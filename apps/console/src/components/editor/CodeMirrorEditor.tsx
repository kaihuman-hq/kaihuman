import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { githubFileStore, Logger } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';

const logger = new Logger('CodeMirrorEditor');

// Theme customization to match Nexus
const nexusTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: '#e2e8f0', // text-nexus-text (slate-200 approx)
    },
    '.cm-content': {
      caretColor: '#38bdf8', // nexus-primary (sky-400)
      fontFamily: 'JetBrains Mono, monospace', // Ensure mono font
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#475569', // nexus-muted (slate-600)
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(56, 189, 248, 0.1)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(56, 189, 248, 0.05)',
    },
  },
  { dark: true },
);

export const CodeMirrorEditor = ({
  path: propsPath,
  zenMode,
  initialContent,
  onChange,
  onSave
}: {
  path?: string;
  zenMode?: boolean;
  initialContent?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Track active file to handle switching content
  const currentPathRef = useRef<string | null>(null);

  // Ref to prevent echo loop (Store -> View -> Store)
  const isUpdatingFromStore = useRef(false);

  // Local state for tracking dirty status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to save
  const handleSave = async () => {
    if (onSave && initialContent !== undefined) {
      // Controlled mode save
      logger.debug(`Saving file via callback`);
      setIsSaving(true);
      try {
        if (viewRef.current) {
           await onSave(viewRef.current.state.doc.toString());
        }
        setHasUnsavedChanges(false);
      } catch (e) {
        logger.error('Failed to save via callback:', e);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const currentPath = propsPath || githubFileStore.activeFile.value;
    if (currentPath) {
      logger.debug(`Saving file: ${currentPath}`);
      setIsSaving(true);
      try {
        await githubFileStore.saveFile(currentPath);
        setHasUnsavedChanges(false);
      } catch (e) {
        logger.error('Failed to save:', e);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const stateRef = useRef({ hasUnsavedChanges, isSaving });
  stateRef.current = { hasUnsavedChanges, isSaving };

  // Auto-save interval (2 minutes) — uses ref to avoid stale closures
  useEffect(() => {
    const intervalId = setInterval(
      () => {
        if (stateRef.current.hasUnsavedChanges && !stateRef.current.isSaving) {
          logger.debug('Auto-saving...');
          handleSave();
        }
      },
      2 * 60 * 1000,
    );

    return () => clearInterval(intervalId);
  }, []); // Run once on mount

  // Compartment for dynamic theme switching
  const themeCompartment = useRef(new Compartment());

  // Initial setup
  useEffect(() => {
    // Determine effective path (prop takes precedence, though usually one or other is used)
    const initialPath = propsPath || githubFileStore.activeFile.value;

    logger.debug(`Mounting. Path: ${initialPath} Ref: ${!!parentRef.current}`);
    if (!parentRef.current) return;

    const startState = EditorState.create({
      doc: initialContent !== undefined ? initialContent : '',
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
            key: 'Mod-s',
            run: (_view) => {
              handleSave();
              return true;
            },
          },
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark, // Base theme
        themeCompartment.current.of(nexusTheme), // Dynamic Helper
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdatingFromStore.current) {
            
            if (onChange && initialContent !== undefined) {
               // Controlled mode
               setHasUnsavedChanges(true);
               onChange(update.state.doc.toString());
               return;
            }

            // Update store for the CORRECT path
            const currentPath = propsPath || githubFileStore.activeFile.value;
            if (currentPath) {
              githubFileStore.updateFileContent(currentPath, update.state.doc.toString());
              // Mark as dirty
              setHasUnsavedChanges(true);
            }
          }
        }),
        // Conditional line wrapping for markdown
        initialPath?.endsWith('.md') ? EditorView.lineWrapping : [],
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: parentRef.current,
    });

    viewRef.current = view;

    // Reset unsaved changes on load?
    setHasUnsavedChanges(false);

    return () => {
      view.destroy();
    };
  }, [propsPath]);

  // Dynamic Theme Update
  useEffect(() => {
    if (viewRef.current) {
      // Define Zen Theme override
      const zenTheme = EditorView.theme(
        {
          '&': {
            backgroundColor: '#0c0a09 !important', // Force overrides
            color: '#a8a29e',
          },
          '.cm-scroller': {
            backgroundColor: 'inherit !important',
          },
          '.cm-gutters': {
            backgroundColor: '#0c0a09 !important', // Match gutter specifically
            color: '#44403c', // Dimmed gutter text
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(56, 189, 248, 0.08) !important',
            backdropFilter: 'brightness(1.5)',
          },
          '.cm-content': {
            fontFamily: 'JetBrains Mono, monospace',
          },
          '.cm-cursor': {
            borderLeftColor: '#38bdf8',
          },
        },
        { dark: true },
      );

      viewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(
          zenMode ? [nexusTheme, zenTheme] : nexusTheme,
        ),
      });
    }
  }, [zenMode]);

  // Handle dynamically updated initialContent (e.g., when contentOverride is applied late)
  useEffect(() => {
    if (initialContent !== undefined && viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (initialContent !== currentDoc) {
        isUpdatingFromStore.current = true;
        try {
          viewRef.current.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: initialContent },
          });
        } finally {
          isUpdatingFromStore.current = false;
        }
      }
    }
  }, [initialContent]);

  // Sync content with store
  useSignalEffect(() => {
    if (initialContent !== undefined) return; // Skip store sync if controlled mode

    const effectivePath = propsPath || githubFileStore.activeFile.value;

    // Get content from OPEN files map directly
    const content = effectivePath
      ? githubFileStore.openFiles.value[effectivePath]?.content || ''
      : '';

    const view = viewRef.current;

    if (!view || !effectivePath) return;

    // Logic to update view if content changed EXTERNALLY
    if (effectivePath !== currentPathRef.current) {
      currentPathRef.current = effectivePath;
      const currentDoc = view.state.doc.toString();
      if (content !== currentDoc) {
        isUpdatingFromStore.current = true;
        try {
          view.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: content || '' },
          });
        } finally {
          isUpdatingFromStore.current = false;
        }
        // New file loaded -> clean state
        setHasUnsavedChanges(false);
      }
    } else {
      // Path is same.
      // If content matches doc, we are good.
      // If content differs, it means external update (e.g. pull).
      const doc = view.state.doc.toString();
      if (content !== doc && content !== null) {
        isUpdatingFromStore.current = true;
        try {
          view.dispatch({
            changes: { from: 0, to: doc.length, insert: content },
          });
        } finally {
          isUpdatingFromStore.current = false;
        }
        // External update -> Reset dirty? Or keep dirty if we had changes?
        // Usually external update overwrites, so we are now "in sync" with that version (but maybe that version is unsaved?)
        // Let's assume external update means we accept it.
        setHasUnsavedChanges(false);
      }
    }
  });

  if (!propsPath && !githubFileStore.activeFile.value && initialContent === undefined) {
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
      <div
        className={`absolute top-4 right-8 transition-opacity duration-300 ${hasUnsavedChanges ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
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
            'SAVE CHANGES'
          )}
        </button>
      </div>
    </div>
  );
};
