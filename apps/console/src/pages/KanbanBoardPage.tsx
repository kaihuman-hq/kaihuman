import { githubFileStore } from '@lifosy/core';
import { KanbanBoard, StatusBar } from '@lifosy/ui';
import { route } from 'preact-router';

export const KanbanBoardPage = () => (
  <>
    <KanbanBoard
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
