import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { githubFileStore } from '@lifosy/core';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';

interface FileViewerProps {
  path: string;
}

export const FileViewer = ({ path }: FileViewerProps) => {
  // When this component mounts (tile focused), load the file
  useEffect(() => {
    console.log('[FileViewer] Mounting for', path);
    githubFileStore.openFile(path);
  }, [path]);

  // CodeMirrorEditor connects to the store internally to get content
  // for githubFileStore.activeFile
  return (
    <div className="h-full w-full relative">
      {/* Ensure the editor takes full height */}
      <CodeMirrorEditor />
    </div>
  );
};
