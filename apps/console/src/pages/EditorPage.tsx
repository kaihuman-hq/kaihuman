import { CodeMirrorEditor } from '../components/editor/CodeMirrorEditor';

export const EditorPage = () => {
  return (
    <div class="h-full flex flex-col">
      <div class="flex-1 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <CodeMirrorEditor />
      </div>
    </div>
  );
};
