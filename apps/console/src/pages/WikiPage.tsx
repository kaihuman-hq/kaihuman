import { layoutStore } from '@lifosy/core';
import { StatusBar, WikiView } from '@lifosy/ui';
import { route } from 'preact-router';

export const WikiPage = () => (
  <>
    <div class="h-[calc(100vh-2rem)]">
      <WikiView
        onEdit={(path) => {
          layoutStore.navigate(path);
          route('/');
        }}
      />
    </div>
    <StatusBar
      mode="WIKI"
      onDashboardClick={() => route('/')}
      onFilesClick={() => route('/')}
      onBoardClick={() => route('/board')}
      onWikiClick={() => route('/wiki')}
    />
  </>
);
