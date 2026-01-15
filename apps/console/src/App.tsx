import { authStore } from '@lifosy/core';

import { Route, Router } from 'preact-router';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/login';

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
    <Router>
      <Route path="/login" component={Login} />
      <ProtectedRoute path="/" component={Dashboard} />
      {/* Editor and Settings are now tiles within Dashboard/MainApp if needed, or we can keep them accessbile via URL if desired, but User said "MainApp should use whole view port" */}
    </Router>
  );
};
