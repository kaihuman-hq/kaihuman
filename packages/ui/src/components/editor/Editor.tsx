import { CodeEditor, type CodeEditorHandle } from '@cascivo/editor';
import { useEffect, useRef } from 'preact/hooks';

export interface EditorProps {
  content: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  className?: string;
}

export const Editor = ({ content, onChange, onSave, className }: EditorProps) => {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  // Latest text, so an external `content` change can compute the replace range.
  const docRef = useRef(content);
  // Guards the echo when applying an external content change (applyEdit fires
  // onValueChange synchronously).
  const isSyncing = useRef(false);

  // Sync when the controlling `content` prop changes externally.
  useEffect(() => {
    const view = editorRef.current;
    if (!view || content === docRef.current) return;
    isSyncing.current = true;
    try {
      view.applyEdit({ from: 0, to: docRef.current.length }, content);
      docRef.current = content;
    } finally {
      isSyncing.current = false;
    }
  }, [content]);

  return (
    <CodeEditor
      ref={editorRef}
      language="markdown"
      defaultValue={content}
      onValueChange={(value) => {
        docRef.current = value;
        if (!isSyncing.current) onChange?.(value);
      }}
      onSave={(value) => onSave?.(value)}
      wrap
      className={className || 'h-full w-full overflow-hidden'}
    />
  );
};
