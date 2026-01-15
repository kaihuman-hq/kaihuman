import { useEffect, useRef } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
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

  // Initial setup
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
            key: "Mod-s",
            run: (view) => {
              if (onSave) onSave(view.state.doc.toString());
              return true;
            }
          }
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        nexusTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
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
  }, []); // Run once on mount

  // Sync content from prop if changed externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (content !== currentDoc && content !== undefined) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content }
      });
    }
  }, [content]);

  return <div ref={parentRef} class={className || "h-full w-full overflow-hidden"} />;
};
