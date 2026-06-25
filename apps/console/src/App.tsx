import { authStore } from '@lifosy/core';
import { NotFound } from '@lifosy/ui';

import { Route, Router, route } from 'preact-router';
import { ExtensionAuthBridge } from './components/ExtensionAuthBridge';
import { ActionLogViewPage } from './pages/ActionLogViewPage';
import { AuthCli } from './pages/AuthCli';
import { Dashboard } from './pages/Dashboard';
import { DemoEntry } from './pages/DemoEntry';
import { ExtensionSuccess } from './pages/ExtensionSuccess';
import { KanbanBoardPage } from './pages/KanbanBoardPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { Login } from './pages/login';
import { QuickLogPage } from './pages/QuickLogPage';
import { QuickNotePage } from './pages/QuickNotePage';
import { QuickTodoPage } from './pages/QuickTodoPage';
import { ShortcutsPage } from './pages/ShortcutsPage';
import { TodoAnalyticsPage } from './pages/TodoAnalyticsPage';
import { WikiPage } from './pages/WikiPage';

// Simple protected route wrapper
const ProtectedRoute = ({ component: Component, ...props }: any) => {
  // Always process OAuth callback first — handles re-auth when a stale token is already in storage.
  // Without this, isAuthenticated would be true from the old token and the new token would be lost.
  if (authStore.handleCallback()) {
    const redirectUrl = localStorage.getItem('lifeos_redirect');
    if (redirectUrl && redirectUrl !== '/') {
      localStorage.removeItem('lifeos_redirect');
      setTimeout(() => route(redirectUrl, true), 10);
    }
  }

  if (!authStore.isAuthenticated.value) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      const path = window.location.pathname;
      if (path !== '/' && !window.location.search.includes('access_token')) {
        localStorage.setItem('lifeos_redirect', path);
      }
      return <Login />;
    }
  }

  // Render directly, no Layout wrapper
  return <Component {...props} />;
};

export const App = () => {
  return (
    <div
      data-theme="dark"
      class="life-os-root h-screen w-screen overflow-hidden bg-[var(--los-bg)] text-[var(--los-fg)] font-mono selection:bg-[var(--los-accent-dim)] selection:text-[var(--los-accent)]"
    >
      <ExtensionAuthBridge />
      <Router>
        <Route path="/login" component={Login} />
        <Route path="/demo" component={DemoEntry} />
        <Route path="/auth/cli" component={AuthCli} />
        <ProtectedRoute path="/extension-onboarded" component={ExtensionSuccess} />
        <ProtectedRoute path="/" component={Dashboard} />
        <ProtectedRoute path="/board" component={KanbanBoardPage} />
        <ProtectedRoute path="/analytics" component={TodoAnalyticsPage} />
        <ProtectedRoute path="/action-log" component={ActionLogViewPage} />
        <ProtectedRoute path="/quick-todo" component={QuickTodoPage} />
        <ProtectedRoute path="/quick-note" component={QuickNotePage} />
        <ProtectedRoute path="/quick-log" component={QuickLogPage} />
        <ProtectedRoute path="/shortcuts" component={ShortcutsPage} />
        <ProtectedRoute path="/knowledge" component={KnowledgeBasePage} />
        <ProtectedRoute path="/wiki" component={WikiPage} />
        <ProtectedRoute path="/files" component={Dashboard} />
        <ProtectedRoute path="/files/:rest*" component={Dashboard} />
        <ProtectedRoute path="/new" component={Dashboard} />
        <Route default component={NotFound} />
        {/* Editor and Settings are now tiles within Dashboard/MainApp if needed, or we can keep them accessbile via URL if desired, but User said "MainApp should use whole view port" */}
      </Router>
    </div>
  );
};
