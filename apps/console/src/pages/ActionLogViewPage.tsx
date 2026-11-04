import { ActionLogView, StatusBar } from '@kaihuman/ui';
import { route } from 'preact-router';

export const ActionLogViewPage = () => (
  <>
    <ActionLogView onNavigateBack={() => route('/')} />
    <StatusBar
      mode="ACTION LOG"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/stream')}
    />
  </>
);
