import { githubFileStore, layoutStore } from '@lifosy/core';
import { StatusBar, WikiView } from '@lifosy/ui';
import { useEffect } from 'preact/hooks';
import { route } from 'preact-router';

export const WikiPage = () => {
  // Load tree if needed (direct navigation to /wiki)
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  return (
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
};
