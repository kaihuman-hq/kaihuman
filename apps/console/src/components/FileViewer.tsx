import { Logger } from '@kaihuman/core';
import { useEffect } from 'preact/hooks';

const logger = new Logger('FileViewer');

import { githubFileStore } from '@kaihuman/core';
import { EncryptedTileWrapper, type TileDef } from '@kaihuman/ui';
import { frozenMessage, isFrozenPath } from '../lib/business/guards';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';

interface FileViewerProps {
  path: string;
  zenMode?: boolean;
  contentOverride?: string;
  onSaveOverride?: (newContent: string) => void;
}

const FrozenBanner = ({ path }: { path: string }) => (
  <div
    role="note"
    className="flex flex-wrap items-center gap-x-3 px-3 py-1.5 text-xs font-mono border-b border-[var(--los-warning)] text-[var(--los-warning)] bg-[var(--los-bg)]"
  >
    <span>{frozenMessage(path)}</span>
    <a href="/business" className="underline">
      Open Business
    </a>
  </div>
);

export const FileViewer = ({ path, zenMode, contentOverride, onSaveOverride }: FileViewerProps) => {
  const frozen = isFrozenPath(path);

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
      <div className="h-full w-full flex flex-col">
        {frozen && <FrozenBanner path={path} />}
        <div className="flex-1 min-h-0 relative">
          <CodeMirrorEditor
            readOnly={frozen}
            path={path}
            zenMode={zenMode}
            initialContent={contentOverride}
            onChange={() => {}} // Editor internal state handles tracking dirty
            onSave={(newContent) => onSaveOverride?.(newContent)}
          />
        </div>
      </div>
    );
  }

  const isEncrypted = path?.endsWith('.enc');

  // CodeMirrorEditor connects to the store internally to get content
  // for githubFileStore.activeFile
  return (
    <div className="h-full w-full flex flex-col">
      {frozen && <FrozenBanner path={path} />}
      <div className="flex-1 min-h-0 relative">
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
                readOnly={frozen}
                path={path}
                zenMode={zenMode}
                initialContent={decryptedContent}
                onChange={() => {}} // Editor internal state handles tracking dirty
                onSave={(newContent) => handleSave(newContent)}
              />
            )}
          </EncryptedTileWrapper>
        ) : (
          <CodeMirrorEditor path={path} zenMode={zenMode} readOnly={frozen} />
        )}
      </div>
    </div>
  );
};
