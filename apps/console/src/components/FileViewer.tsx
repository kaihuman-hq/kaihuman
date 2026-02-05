import { Logger } from '@lifosy/core';
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const logger = new Logger('FileViewer');

import { githubFileStore } from '@lifosy/core';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';

interface FileViewerProps {
  path: string;
  zenMode?: boolean;
}

export const FileViewer = ({ path, zenMode }: FileViewerProps) => {
  // When this component mounts (tile focused), load the file
  useEffect(() => {
    logger.debug(`Mounting for ${path}`);
    if (!path) logger.error('Path is empty!');
    githubFileStore.openFile(path);
  }, [path]);

  // CodeMirrorEditor connects to the store internally to get content
  // for githubFileStore.activeFile
  return (
    <div className="h-full w-full relative">
      {/* Ensure the editor takes full height */}
      <CodeMirrorEditor path={path} zenMode={zenMode} />
    </div>
  );
};
