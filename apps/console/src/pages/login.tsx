import { authStore, enterDemoMode } from '@lifosy/core';
import { Login as LoginPage } from '@lifosy/ui';
import { route } from 'preact-router';

export function Login() {
  return (
    <LoginPage
      onLogin={() => authStore.login()}
      onTryDemo={() => {
        enterDemoMode();
        route('/', true);
      }}
    />
  );
}
