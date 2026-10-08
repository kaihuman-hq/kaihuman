import { authStore, githubProfileStore } from '@kaihuman/core';
import { useEffect } from 'preact/hooks';

// Extensions built before the rename still look for the `lifosy` names, and the console deploys
// before every installed extension updates; drop 'lifosy' once those have updated.
const PREFIXES = ['kaihuman', 'lifosy'];

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
    const reposList = githubProfileStore.repos.value || [];
    for (const prefix of PREFIXES) {
      if (token) {
        document.body.setAttribute(`data-${prefix}-auth`, token);
      } else {
        document.body.removeAttribute(`data-${prefix}-auth`);
      }

      if (repo) {
        document.body.setAttribute(`data-${prefix}-repo`, repo);
      } else {
        document.body.removeAttribute(`data-${prefix}-repo`);
      }

      if (reposList.length > 0) {
        document.body.setAttribute(`data-${prefix}-repos`, JSON.stringify(reposList));
      } else {
        document.body.removeAttribute(`data-${prefix}-repos`);
      }

      // Also dispatch an event in case the extension is listening
      window.dispatchEvent(
        new CustomEvent(`${prefix}-auth-update`, { detail: { token, repo, repos: reposList } }),
      );
    }

    return () => {
      for (const prefix of PREFIXES) {
        document.body.removeAttribute(`data-${prefix}-auth`);
        document.body.removeAttribute(`data-${prefix}-repo`);
        document.body.removeAttribute(`data-${prefix}-repos`);
      }
    };
  }, [token, repo, reposList]);

  useEffect(() => {
    // We can keep this empty or remove it, but nothing needed here since the success page handles it.
  }, []);

  return (
    <>
      {PREFIXES.map((prefix) => (
        <div key={prefix} id={`${prefix}-extension-bridge`} style={{ display: 'none' }} />
      ))}
    </>
  );
}
