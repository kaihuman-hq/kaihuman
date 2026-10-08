import { authStore, githubProfileStore } from '@kaihuman/core';
import { Button } from '@kaihuman/ui';
import { useEffect, useState } from 'preact/hooks';
import { submitCliCallback } from '../lib/cli-callback';

export function AuthCli() {
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'redirecting' | 'error'>(
    'checking',
  );
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      // 1. Check if authenticated
      if (!authStore.isAuthenticated.value) {
        // If not, maybe we are handling a callback?
        if (authStore.handleCallback()) {
          // processed callback, now we are authenticated
        } else {
          // Not authenticated, redirect to login but keeping return url would be nice if we had one
          // For now, just show login button
          setStatus('checking');
          return;
        }
      }

      setStatus('authenticated');

      // 2. Get query params
      const params = new URLSearchParams(window.location.search);
      const port = params.get('port') || '3000'; // Default to 3000 if not provided, but CLI should provide it
      const state = params.get('state');

      // 3. Hand the token to the waiting program, by POST so it stays out of the history
      if (authStore.token.value) {
        setStatus('redirecting');
        try {
          submitCliCallback(document, {
            port,
            token: authStore.token.value,
            state: state || '',
            repo: githubProfileStore.currentRepo.value?.full_name || '',
          });
        } catch (e: any) {
          setStatus('error');
          setErrorMsg(e.message);
        }
      } else {
        setStatus('error');
        setErrorMsg('No token found');
      }
    };

    checkAuth();
  }, [authStore.isAuthenticated.value]);

  if (!authStore.isAuthenticated.value) {
    return (
      <div class="flex h-screen w-full flex-col items-center justify-center bg-nexus-bg text-nexus-text font-sans">
        <div class="max-w-md space-y-8 rounded-lg border border-nexus-border bg-nexus-panel p-10 shadow-2xl text-center">
          <h2 class="text-2xl font-bold text-white">kaihuman CLI</h2>
          <p class="text-nexus-muted">
            Sign in to connect your terminal to your continuous improvement system.
          </p>
          <Button onClick={() => authStore.login()} label="Login to Continue" className="w-full" />
        </div>
      </div>
    );
  }

  return (
    <div class="flex h-screen w-full flex-col items-center justify-center bg-nexus-bg text-nexus-text font-sans">
      <div class="max-w-md p-10 text-center">
        {status === 'checking' && <p>Checking authentication...</p>}
        {status === 'authenticated' && <p>Authenticated! Preparing to redirect...</p>}
        {status === 'redirecting' && (
          <div class="space-y-4">
            <h2 class="text-2xl font-bold text-white">Authenticating CLI...</h2>
            <p class="text-nexus-muted">You are being redirected back to your terminal.</p>
            <div class="animate-pulse text-sm text-nexus-muted">
              If nothing happens, check your terminal.
            </div>
          </div>
        )}
        {status === 'error' && (
          <div class="space-y-4 text-red-500">
            <h2 class="text-2xl font-bold">Error</h2>
            <p>{errorMsg}</p>
            <Button onClick={() => window.close()} label="Close Window" />
          </div>
        )}
      </div>
    </div>
  );
}
