import { authStore } from '@lifosy/core';
import { NotFound } from '@lifosy/ui';

import { Route, Router } from 'preact-router';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/login';
import { AuthCli } from './pages/AuthCli';
import { ExtensionSuccess } from './pages/ExtensionSuccess';
import { ExtensionAuthBridge } from './components/ExtensionAuthBridge';

// Simple protected route wrapper
const ProtectedRoute = ({ component: Component, ...props }: any) => {
  if (!authStore.isAuthenticated.value) {
    // Check if we just came back from auth
    if (authStore.handleCallback()) {
      // Handled
    } else {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        return <Login />;
      }
    }
  }

  // Render directly, no Layout wrapper
  return <Component {...props} />;
};

export const App = () => {
  return (
    <div class="life-os-root h-screen w-screen overflow-hidden bg-[var(--los-bg)] text-[var(--los-fg)] font-mono selection:bg-[var(--los-accent-dim)] selection:text-[var(--los-accent)]">
      <ExtensionAuthBridge />
      <Router>
        <Route path="/login" component={Login} />
        <Route path="/auth/cli" component={AuthCli} />
        <ProtectedRoute path="/extension-onboarded" component={ExtensionSuccess} />
        <ProtectedRoute path="/" component={Dashboard} />
        <ProtectedRoute path="/files" component={Dashboard} />
        <ProtectedRoute path="/files/:rest*" component={Dashboard} />
        <ProtectedRoute path="/new" component={Dashboard} />
        <Route default component={NotFound} />
        {/* Editor and Settings are now tiles within Dashboard/MainApp if needed, or we can keep them accessbile via URL if desired, but User said "MainApp should use whole view port" */}
      </Router>
    </div>
  );
};
