import type { ComponentChildren } from 'preact';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ComponentChildren;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div class="flex h-screen w-full bg-nexus-bg text-nexus-text overflow-hidden font-sans">
      <Sidebar />
      <main class="flex-1 flex flex-col h-full overflow-hidden relative bg-nexus-bg">
        {/* Top bar or breadcrumbs could go here */}
        <div class="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-nexus-border scrollbar-track-transparent">
          {children}
        </div>
      </main>
    </div>
  );
};
