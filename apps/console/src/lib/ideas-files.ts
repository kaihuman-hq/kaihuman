import { githubFileStore, githubService, type TreeItem } from '@kaihuman/core';
import { ideaSlugOf } from '@kaihuman/formats';

/** The idea files in a repo tree: `.kh/ideas/<slug>.md`, no subfolders. */
export const ideaTreeItems = (tree: readonly TreeItem[]) =>
  tree.filter((item) => item.type === 'blob' && ideaSlugOf(item.path) !== null);

export const ideaFileExists = (path: string) =>
  githubFileStore.tree.peek().some((item) => item.path === path);

// Contents by `repo:path`, valid while the tree still lists the same blob sha. Survives
// navigating away and back, so the overview does not refetch unchanged ideas.
const contentCache = new Map<string, { sha: string; content: string }>();
const cacheKey = (repo: string, path: string) => `${repo}:${path}`;

export interface LoadedIdeas {
  contents: Record<string, string>;
  /** One message per file that could not be read. */
  errors: string[];
}

/** Reads the given idea files, four at a time, skipping those cached for the same sha. */
export async function loadIdeaContents(
  repoFullName: string,
  items: readonly TreeItem[],
): Promise<LoadedIdeas> {
  const [owner = '', name = ''] = repoFullName.split('/');
  const contents: Record<string, string> = {};
  const errors: string[] = [];
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const key = cacheKey(repoFullName, item.path);
      const cached = contentCache.get(key);
      if (cached && cached.sha === item.sha) {
        contents[item.path] = cached.content;
        continue;
      }
      try {
        const { content } = await githubService.getFileContent(owner, name, item.path);
        contentCache.set(key, { sha: item.sha, content });
        contents[item.path] = content;
      } catch (err) {
        errors.push(`${item.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { contents, errors };
}

/** Records a write so the overview shows it until the tree is reloaded with the new sha. */
const remember = (path: string, content: string) => {
  const repo = githubFileStore.loadedRepo.peek();
  const sha = githubFileStore.tree.peek().find((item) => item.path === path)?.sha ?? '';
  if (repo) contentCache.set(cacheKey(repo, path), { sha, content });
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
    // Undo the store's optimistic entry, or the failed slug would read as taken.
    const { [path]: _failed, ...open } = githubFileStore.openFiles.peek();
    githubFileStore.openFiles.value = open;
    githubFileStore.tree.value = githubFileStore.tree.peek().filter((item) => item.path !== path);
    const dirty = new Set(githubFileStore.dirtyFiles.peek());
    dirty.delete(path);
    githubFileStore.dirtyFiles.value = dirty;
    throw new Error(githubFileStore.error.peek() ?? `Could not create ${path}.`);
  }
  remember(path, content);
}
