import { ActionLogView, StatusBar } from '@lifosy/ui';
import { route } from 'preact-router';

export const ActionLogViewPage = () => (
  <>
    <ActionLogView onNavigateBack={() => route('/')} />
    <StatusBar
      mode="ACTION LOG"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
    />
  </>
);
