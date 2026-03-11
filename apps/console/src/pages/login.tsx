import { authStore } from '@lifosy/core';
import { Button } from '@lifosy/ui';

export function Login() {
  return (
    <div class="flex h-screen w-full items-center justify-center bg-nexus-bg text-nexus-text font-sans">
      <div class="w-full max-w-md space-y-8 rounded-lg border border-nexus-border bg-nexus-panel p-10 shadow-2xl">
        <div class="text-center">
          <h2 class="mt-6 text-3xl font-bold tracking-tight text-white">KaiHuman</h2>
          <p class="mt-2 text-sm text-nexus-muted">Sign in to access your dashboard</p>
        </div>

        <div class="mt-8 space-y-6">
          <Button
            onClick={() => authStore.login()}
            label="Sign in with GitHub"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
