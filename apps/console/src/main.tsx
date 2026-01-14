import { authStore } from '@lifosy/core';
import { render } from 'preact';
import { Route, Router } from 'preact-router';
import { Login } from './pages/login';
import './index.css';

// Simple protected route wrapper
const ProtectedRoute = ({ component: Component, ...props }: any) => {
  if (!authStore.isAuthenticated.value) {
    // Check if we just came back from auth
    if (authStore.handleCallback()) {
      return <Component {...props} />;
    }
    // Redirect to login if nowhere else to go
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
      return null;
    }
  }
  return <Component {...props} />;
};

const App = () => {
  return (
    <Router>
      <Route path="/login" component={Login} />
      <ProtectedRoute path="/" component={() => <div>Dashboard (Authenticated)</div>} />
    </Router>
  );
};

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed to exist
render(<App />, document.getElementById('app')!);
