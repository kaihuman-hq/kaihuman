import { useEffect, useState } from 'preact/hooks';
import { authStore, githubProfileStore } from '@lifosy/core';

export function ExtensionAuthBridge() {
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // Expose token for the extension content script to grab
    // We put it in a specific hidden element that the content script can find easily
    // This is a simple bridge mechanism.
    const token = authStore.token.value;
    const repo = githubProfileStore.currentRepo.value?.full_name;

    if (token) {
      document.body.setAttribute('data-lifosy-auth', token);
    } else {
      document.body.removeAttribute('data-lifosy-auth');
    }

    if (repo) {
      document.body.setAttribute('data-lifosy-repo', repo);
    } else {
      document.body.removeAttribute('data-lifosy-repo');
    }

    const reposList = githubProfileStore.repos.value || [];
    if (reposList.length > 0) {
      document.body.setAttribute('data-lifosy-repos', JSON.stringify(reposList));
    } else {
      document.body.removeAttribute('data-lifosy-repos');
    }

    // Also dispatch an event in case the extension is listening
    window.dispatchEvent(new CustomEvent('lifosy-auth-update', { detail: { token, repo, repos: reposList } }));

    return () => {
      document.body.removeAttribute('data-lifosy-auth');
      document.body.removeAttribute('data-lifosy-repo');
      document.body.removeAttribute('data-lifosy-repos');
    };
  }, [authStore.token.value, githubProfileStore.currentRepo.value?.full_name, githubProfileStore.repos.value]);

  useEffect(() => {
    const handleOnboarded = () => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    };

    window.addEventListener('EXTENSION_ONBOARDED', handleOnboarded);
    return () => window.removeEventListener('EXTENSION_ONBOARDED', handleOnboarded);
  }, []);

  return (
    <>
      <div id="lifosy-extension-bridge" style={{ display: 'none' }} />
      {showToast && (
        <div class="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded bg-[var(--los-accent)] px-4 py-3 font-mono text-sm font-bold text-black shadow-lg animate-in fade-in slide-in-from-bottom-4">
          Browser extension onboarded!
        </div>
      )}
    </>
  );
}
