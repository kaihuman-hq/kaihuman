import { authStore } from '@lifosy/core';
import { Route, Router } from 'preact-router';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';
import { Login } from './pages/login';
import { Settings } from './pages/Settings';

// Simple protected route wrapper
const ProtectedRoute = ({ component: Component, ...props }: any) => {
  if (!authStore.isAuthenticated.value) {
    // Check if we just came back from auth
    if (authStore.handleCallback()) {
      // If handled, render component.
      // Warning: React/Preact signals might trigger re-render anyway.
    } else {
      // Redirect to login if nowhere else to go
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        // Avoid loop if already redirecting
        // window.location.href = '/login';
        // Ideally use router.route('/login') but we are inside Router context?
        // No, outside context to use route().
        // Just return null and redirect via effect or just render Login directly?
        return <Login />;
      }
    }
  }

  // Wrap protected content in Layout
  return (
    <AppLayout>
      <Component {...props} />
    </AppLayout>
  );
};

export const App = () => {
  return (
    <Router>
      <Route path="/login" component={Login} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/editor" component={EditorPage} />
      <ProtectedRoute path="/settings" component={Settings} />
    </Router>
  );
};
