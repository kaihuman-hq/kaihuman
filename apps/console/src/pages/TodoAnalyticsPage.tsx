import { StatusBar, TodoAnalytics } from '@kaihuman/ui';
import { route } from 'preact-router';

export const TodoAnalyticsPage = () => (
  <>
    <TodoAnalytics onNavigateBack={() => history.back()} />
    <StatusBar
      mode="ANALYTICS"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
    />
  </>
);
