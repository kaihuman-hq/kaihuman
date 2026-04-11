import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'preact/hooks';

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

export interface EditorProps {
  content: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  className?: string;
}

export const Editor = ({ content, onChange, onSave, className }: EditorProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialContentRef = useRef(content);

  // Keep callback refs current so the editor closure never goes stale,
  // without including the callbacks in the setup effect's dependency array
  // (which would destroy+recreate the editor — and lose focus — on every keystroke).
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Prevents the echo loop: Store→View dispatch fires updateListener which
  // calls onChange which updates the signal which schedules another content
  // sync effect which dispatches again → freeze. When this flag is set we
  // are in the middle of a programmatic dispatch and onChange must be skipped.
  const isUpdatingFromStore = useRef(false);

  // Initial setup — runs once on mount only
  useEffect(() => {
    if (!parentRef.current) return;

    const startState = EditorState.create({
      doc: initialContentRef.current,
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
          {
            key: 'Mod-s',
            run: (view) => {
              if (onSaveRef.current) onSaveRef.current(view.state.doc.toString());
              return true;
            },
          },
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        nexusTheme,
        EditorView.updateListener.of((update) => {
          // Skip when the change came from a programmatic content sync — not the user.
          if (update.docChanged && !isUpdatingFromStore.current && onChangeRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: parentRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []); // Empty deps: editor is created once and never torn down due to callback churn

  // Sync content from prop if changed externally (e.g. programmatic reset).
  // Uses isUpdatingFromStore to prevent the dispatch from calling onChange,
  // which would update the signal, which would schedule another sync effect.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (content !== currentDoc && content !== undefined) {
      isUpdatingFromStore.current = true;
      try {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: content },
        });
      } finally {
        isUpdatingFromStore.current = false;
      }
    }
  }, [content]);

  return <div ref={parentRef} class={className || 'h-full w-full overflow-hidden'} />;
};
