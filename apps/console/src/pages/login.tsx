import { authStore } from '@lifosy/core';

export function Login() {
  return (
    <div class="flex h-screen w-full items-center justify-center bg-nexus-bg text-nexus-text font-sans">
      <div class="w-full max-w-md space-y-8 rounded-lg border border-nexus-border bg-nexus-panel p-10 shadow-2xl">
        <div class="text-center">
          <h2 class="mt-6 text-3xl font-bold tracking-tight text-white">Life OS</h2>
          <p class="mt-2 text-sm text-nexus-muted">Sign in to access your dashboard</p>
        </div>

        <div class="mt-8 space-y-6">
          <button
            onClick={() => authStore.login()}
            type="button"
            class="group relative flex w-full justify-center rounded-md border border-transparent bg-nexus-primary px-4 py-2 text-sm font-medium text-black hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-nexus-primary focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200"
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
