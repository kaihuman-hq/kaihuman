import { githubFileStore } from '@kaihuman/core';
import { StatusBar, WikiView } from '@kaihuman/ui';
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
          onClientLink={(slug) => route(`/clients/${slug}`)}
          onEdit={(path) => {
            // Route to the file's URL so MainApp's URL→State resolver opens it in
            // the editor. Routing to '/' would reset activeTileId to null on mount.
            const cleanPath = path
              .split('/')
              .map((segment) => encodeURIComponent(segment))
              .join('/');
            route(`/files/${cleanPath}`);
          }}
        />
      </div>
      <StatusBar
        mode="WIKI"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/stream')}
        onWikiClick={() => route('/wiki')}
      />
    </>
  );
};
