import { FileText, Home, LayoutDashboard, Settings } from 'lucide-preact';
import { Link } from 'preact-router/match';
import { RepoSelector } from '../repo/RepoSelector';

export const Sidebar = () => {
  return (
    <aside class="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-full">
      <div class="p-4 border-b border-slate-800">
        <h1 class="text-xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
          CONSOLE
        </h1>
      </div>

      <div class="p-2">
        <RepoSelector />
      </div>

      <nav class="flex-1 p-2 space-y-1">
        <Link
          href="/"
          activeClassName="bg-slate-800 text-white"
          class="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 rounded hover:bg-slate-800/50 hover:text-white transition-colors"
        >
          <Home size={18} />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/editor"
          activeClassName="bg-slate-800 text-white"
          class="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 rounded hover:bg-slate-800/50 hover:text-white transition-colors"
        >
          <FileText size={18} />
          <span>Editor</span>
        </Link>
        <div class="border-t border-slate-800 my-2 pt-2">
          <Link
            href="/settings"
            activeClassName="bg-slate-800 text-white"
            class="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 rounded hover:bg-slate-800/50 hover:text-white transition-colors"
          >
            <Settings size={18} />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      <div class="p-4 text-xs text-slate-600 border-t border-slate-800">v0.1.0-alpha</div>
    </aside>
  );
};
