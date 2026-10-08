import { Logger } from '@kaihuman/core';
import { useEffect } from 'preact/hooks';

const logger = new Logger('FileViewer');

import { githubFileStore } from '@kaihuman/core';
import { EncryptedTileWrapper, type TileDef } from '@kaihuman/ui';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';

interface FileViewerProps {
  path: string;
  zenMode?: boolean;
  contentOverride?: string;
  onSaveOverride?: (newContent: string) => void;
}

export const FileViewer = ({ path, zenMode, contentOverride, onSaveOverride }: FileViewerProps) => {
  // When this component mounts (tile focused), load the file ONLY if no content override is provided
  useEffect(() => {
    if (contentOverride !== undefined) return;

    logger.debug(`Mounting for ${path}`);
    if (!path) logger.error('Path is empty!');
    githubFileStore.openFile(path);
  }, [path, contentOverride]);

  // If MainApp already decrypted the file, it passes the plaintext via contentOverride.
  // We can skip the redundant encryption wrapper entirely.
  if (contentOverride !== undefined) {
    return (
      <div className="h-full w-full relative">
        <CodeMirrorEditor
          path={path}
          zenMode={zenMode}
          initialContent={contentOverride}
          onChange={() => {}} // Editor internal state handles tracking dirty
          onSave={(newContent) => onSaveOverride?.(newContent)}
        />
      </div>
    );
  }

  const isEncrypted = path?.endsWith('.enc');

  // CodeMirrorEditor connects to the store internally to get content
  // for githubFileStore.activeFile
  return (
    <div className="h-full w-full relative">
      {isEncrypted ? (
        <EncryptedTileWrapper
          tile={
            {
              id: path,
              rawContent: githubFileStore.openFiles.value[path]?.content,
              onContentChange: (newContent: string) => {
                githubFileStore.updateFileContent(path, newContent);
                githubFileStore
                  .saveFile(path)
                  .catch((e) => logger.error('Failed to save encrypted file', e));
              },
            } as TileDef
          }
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
