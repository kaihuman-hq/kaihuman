import type { ComponentChildren } from 'preact';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ComponentChildren;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div class="flex h-screen w-full bg-slate-900 text-slate-100 overflow-hidden font-sans">
      <Sidebar />
      <main class="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top bar or breadcrumbs could go here */}
        <div class="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {children}
        </div>
      </main>
    </div>
  );
};
