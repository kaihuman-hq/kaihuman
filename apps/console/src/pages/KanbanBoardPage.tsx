import { KanbanBoard, StatusBar } from '@lifosy/ui';
import { route } from 'preact-router';

export const KanbanBoardPage = () => (
  <>
    <KanbanBoard onNavigateBack={() => route('/')} onAnalyticsClick={() => route('/analytics')} />
    <StatusBar
      mode="BOARD"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
    />
  </>
);
