import { authStore } from '@lifosy/core';
import { Login as LoginPage } from '@lifosy/ui';

export function Login() {
  return <LoginPage onLogin={() => authStore.login()} />;
}
