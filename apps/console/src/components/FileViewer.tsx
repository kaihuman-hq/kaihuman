import { Logger } from '@lifosy/core';
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const logger = new Logger('FileViewer');

import { githubFileStore } from '@lifosy/core';
import { EncryptedTileWrapper, TileDef } from '@lifosy/ui';
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

  const isEncrypted = path?.endsWith('.enc');

  // CodeMirrorEditor connects to the store internally to get content
  // for githubFileStore.activeFile
  return (
    <div className="h-full w-full relative">
      {isEncrypted ? (
        <EncryptedTileWrapper 
          tile={{ id: path, rawContent: githubFileStore.openFiles.value[path]?.content } as TileDef} 
          mode={zenMode ? 'FOCUS' : 'FOCUS'}
        >
          {(decryptedContent: string, handleSave: (newContent: string) => void) => (
             <CodeMirrorEditor 
               path={path} 
               zenMode={zenMode} 
               initialContent={decryptedContent} 
               onChange={() => {}} // Editor internal state handles tracking dirty
               onSave={(newContent) => handleSave(newContent)}
             />
          )}
        </EncryptedTileWrapper>
      ) : (
        <CodeMirrorEditor path={path} zenMode={zenMode} />
      )}
    </div>
  );
};
