import { githubFileStore } from '@kaihuman/core';
import { KanbanBoard, StatusBar } from '@kaihuman/ui';
import { route } from 'preact-router';

export const StreamsBoardPage = () => (
  <>
    <KanbanBoard
      view="streams"
      onNavigateBack={() => route('/')}
      onAnalyticsClick={() => route('/analytics')}
      onCreateFile={async (path, content) => {
        await githubFileStore.createFile(path, content);
      }}
      onOpenFile={(path) => {
        route(`/files/${encodeURIComponent(path)}`);
      }}
    />
    <StatusBar
      mode="BOARD"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
    />
  </>
);
