import { authStore, enterDemoMode } from '@kaihuman/core';
import { Login as LoginPage } from '@kaihuman/ui';
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
