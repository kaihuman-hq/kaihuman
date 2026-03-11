import { authStore, githubProfileStore } from '@lifosy/core';
import { useEffect, useState } from 'preact/hooks';

export function ExtensionAuthBridge() {
  // Accessing signal .value inside the component body tells Preact to re-render
  // whenever these signals change.
  const token = authStore.token.value;
  const repo = githubProfileStore.currentRepo.value?.full_name;
  const reposList = githubProfileStore.repos.value || [];

  useEffect(() => {
    // Expose token for the extension content script to grab
    // We put it in a specific hidden element that the content script can find easily
    // This is a simple bridge mechanism.
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
    window.dispatchEvent(
      new CustomEvent('lifosy-auth-update', { detail: { token, repo, repos: reposList } }),
    );

    return () => {
      document.body.removeAttribute('data-lifosy-auth');
      document.body.removeAttribute('data-lifosy-repo');
      document.body.removeAttribute('data-lifosy-repos');
    };
  }, [token, repo, reposList]);

  useEffect(() => {
    // We can keep this empty or remove it, but nothing needed here since the success page handles it.
  }, []);

  return (
    <>
      <div id="lifosy-extension-bridge" style={{ display: 'none' }} />
    </>
  );
}
