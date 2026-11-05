import { gitBlobSha, githubFileStore, type TreeItem } from '@kaihuman/core';
import { ideaSlugOf } from '@kaihuman/formats';
import { loadRepoFiles, rememberRepoFile } from './repo-files';

/** The idea files in a repo tree: `.kh/ideas/<slug>.md`, no subfolders. */
export const ideaTreeItems = (tree: readonly TreeItem[]) =>
  tree.filter((item) => item.type === 'blob' && ideaSlugOf(item.path) !== null);

export const ideaFileExists = (path: string) =>
  githubFileStore.tree.peek().some((item) => item.path === path);

/** Reads the given idea files, skipping those cached for the same sha. */
export const loadIdeaContents = (repoFullName: string, items: readonly TreeItem[]) =>
  loadRepoFiles(repoFullName, items);

/**
 * Records a write so the overview shows it until the tree is reloaded with the new sha. The
 * cache is keyed by the content's own blob sha: the tree still holds the old sha, which would
 * pair the new text with the old version.
 */
const remember = (path: string, content: string) => {
  const repo = githubFileStore.loadedRepo.peek();
  if (repo) rememberRepoFile(repo, path, gitBlobSha(content), content);
};

/** Waits for the store's save and turns its error signal back into an exception. */
async function saveThroughStore(path: string) {
  githubFileStore.error.value = null;
  await githubFileStore.saveFile(path);
  if (githubFileStore.dirtyFiles.peek().has(path)) {
    throw new Error(githubFileStore.error.peek() ?? `Could not save ${path}.`);
  }
}

/**
 * Applies `edit` to the latest version of an idea file and saves it with that version's sha.
 * The file is re-read first, so an agent's commit since the page loaded is not overwritten.
 */
export async function updateIdeaFile(path: string, edit: (text: string) => string) {
  githubFileStore.error.value = null;
  await githubFileStore.openFile(path);
  const file = githubFileStore.openFiles.peek()[path];
  if (!file) throw new Error(githubFileStore.error.peek() ?? `Could not load ${path}.`);
  const next = edit(file.content);
  githubFileStore.updateFileContent(path, next);
  await saveThroughStore(path);
  remember(path, next);
  return next;
}

/** Creates an idea file; refuses when the path already exists, so a slug is never overwritten. */
export async function createIdeaFile(path: string, content: string) {
  if (ideaFileExists(path) || githubFileStore.openFiles.peek()[path]) {
    throw new Error(`${path} already exists.`);
  }
  githubFileStore.error.value = null;
  await githubFileStore.createFile(path, content);
  if (githubFileStore.dirtyFiles.peek().has(path)) {
    // Undo the store's optimistic entry, or the failed slug would read as taken (and the cached
    // record would bring it back on the next tree load).
    const message = githubFileStore.error.peek() ?? `Could not create ${path}.`;
    githubFileStore.tree.value = githubFileStore.tree.peek().filter((item) => item.path !== path);
    await githubFileStore.discardLocal(path);
    throw new Error(message);
  }
  remember(path, content);
}
