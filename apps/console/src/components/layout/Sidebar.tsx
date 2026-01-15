import { FileText, Home, Settings } from 'lucide-preact';
import { Link } from 'preact-router/match';
import { RepoSelector } from '../repo/RepoSelector';
import { FileTree } from '../files/FileTree';
import { Sidebar as NexusSidebar, SidebarHeader, SidebarContent, SidebarFooter } from '@lifosy/ui';

export const Sidebar = () => {
  return (
    <NexusSidebar>
      <SidebarHeader>
        <h1 class="text-xl font-bold bg-gradient-to-r from-nexus-primary to-nexus-secondary bg-clip-text text-transparent">
          CONSOLE
        </h1>
      </SidebarHeader>

      <div class="p-2">
        <RepoSelector />
      </div>

      <SidebarContent>
        <nav class="space-y-1">
          <Link
            href="/"
            activeClassName="bg-nexus-primary/20 text-nexus-primary"
            class="flex items-center gap-3 px-3 py-2 text-sm text-nexus-muted rounded hover:bg-nexus-primary/10 hover:text-nexus-text transition-colors"
          >
            <Home size={18} />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/editor"
            activeClassName="bg-nexus-primary/20 text-nexus-primary"
            class="flex items-center gap-3 px-3 py-2 text-sm text-nexus-muted rounded hover:bg-nexus-primary/10 hover:text-nexus-text transition-colors"
          >
            <FileText size={18} />
            <span>Editor</span>
          </Link>
          <div class="border-t border-nexus-border my-2 pt-2">
            <Link
              href="/settings"
              activeClassName="bg-nexus-primary/20 text-nexus-primary"
              class="flex items-center gap-3 px-3 py-2 text-sm text-nexus-muted rounded hover:bg-nexus-primary/10 hover:text-nexus-text transition-colors"
            >
              <Settings size={18} />
              <span>Settings</span>
            </Link>
          </div>
        </nav>

        <div class="mt-4 pt-4 border-t border-nexus-border flex-1 overflow-hidden flex flex-col">
          <h3 class="px-2 text-xs font-semibold text-nexus-muted mb-2 flex-shrink-0">FILES</h3>
          <FileTree />
        </div>
      </SidebarContent>

      <SidebarFooter>
        <div class="text-xs text-nexus-muted">v0.1.0-alpha</div>
      </SidebarFooter>
    </NexusSidebar >
  );
};
