import { ConflictError, githubFileStore, githubService, type TreeItem } from '@kaihuman/core';
import { type BusinessRepo, loadBusinessRepo, type Result } from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';
import { loadRepoFiles, rememberRepoFile } from '../repo-files';
import { businessTreeItems } from './load';

export const CONFLICT_MESSAGE =
  'Someone else changed the repository at the same time. Reload and try again.';

/** `null` deletes the path. */
export type FileChanges = Record<string, string | null>;

/** What a builder sees: the repository as it is right now, not as the page last loaded it. */
export type Fresh = {
  headSha: string;
  tree: TreeItem[];
  repo: BusinessRepo;
  /** Current content, or `null` when the path is not in the fresh tree. */
  read: (path: string) => Promise<string | null>;
};

export const writeErrorMessage = (e: unknown): string =>
  e instanceof ConflictError
    ? CONFLICT_MESSAGE
    : `Saving failed, nothing was written: ${e instanceof Error ? e.message : String(e)}`;

async function readFresh(owner: string, name: string, target: KBRepo): Promise<Fresh> {
  const headSha = await githubService.getHeadSha(owner, name, target.default_branch);
  // The branch may move between these two calls. The tree is then newer than `headSha`, and the
  // commit below conflicts on `expectedHeadSha`, so a builder never commits on stale data.
  // The API types `url` as optional; `TreeItem` requires it.
  const tree: TreeItem[] = (
    await githubService.fetchRepoTree(owner, name, target.default_branch)
  ).map((item) => ({ ...item, url: item.url ?? '' }));
  const loaded = await loadRepoFiles(target.full_name, businessTreeItems(tree));
  if (loaded.errors.length > 0) throw new Error(loaded.errors.join('; '));
  const blobPaths = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  const repo = loadBusinessRepo(new Map(Object.entries(loaded.contents)), blobPaths);
  const read = async (path: string) => {
    const item = tree.find((t) => t.type === 'blob' && t.path === path);
    if (!item) return null;
    const result = await loadRepoFiles(target.full_name, [item]);
    if (result.errors.length > 0) throw new Error(result.errors.join('; '));
    return result.contents[path] ?? null;
  };
  return { headSha, tree, repo, read };
}

/**
 * Builds a change from fresh repository state and commits it in one commit. If the branch moved
 * meanwhile, it rebuilds from the new state and tries once more; a second conflict throws
 * {@link ConflictError}. A builder `ok: false` is returned as is, with nothing committed.
 */
export async function writeBusiness(
  target: KBRepo,
  build: (fresh: Fresh) => Promise<Result<{ changes: FileChanges; message: string }>>,
): Promise<Result<{ commitSha: string }>> {
  const slash = target.full_name.indexOf('/');
  const owner = target.full_name.slice(0, slash);
  const name = target.full_name.slice(slash + 1);

  for (let attempt = 0; ; attempt++) {
    const fresh = await readFresh(owner, name, target);
    const built = await build(fresh);
    if (!built.ok) return built;
    const { changes, message } = built.value;
    try {
      const { commitSha, blobShas } = await githubService.commitFiles(
        owner,
        name,
        target.default_branch,
        changes,
        message,
        { expectedHeadSha: fresh.headSha },
      );
      await githubFileStore.applyCommit(changes, blobShas);
      for (const [path, content] of Object.entries(changes)) {
        const sha = blobShas[path];
        if (content !== null && sha) rememberRepoFile(target.full_name, path, sha, content);
      }
      return { ok: true, value: { commitSha } };
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 1) throw e;
    }
  }
}
