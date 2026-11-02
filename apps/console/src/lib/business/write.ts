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
  // The tree and every file are read at `headSha`, so what the builder sees is exactly the state
  // `expectedHeadSha` guards. Content by commit never changes, and a blob that differs from the
  // tree (a stale HTTP cache) is treated as a conflict instead of being built on.
  // The API types `url` as optional; `TreeItem` requires it.
  const tree: TreeItem[] = (
    await githubService.fetchRepoTree(owner, name, target.default_branch, { commitSha: headSha })
  ).map((item) => ({ ...item, url: item.url ?? '' }));
  const load = async (items: TreeItem[]) => {
    const loaded = await loadRepoFiles(target.full_name, items, 4, { ref: headSha });
    if (loaded.errors.length > 0) throw new Error(loaded.errors.join('; '));
    if (loaded.mismatched.length > 0) {
      throw new ConflictError(`${loaded.mismatched.join(', ')} changed while reading`);
    }
    return loaded.contents;
  };
  const contents = await load(businessTreeItems(tree));
  const blobPaths = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  const repo = loadBusinessRepo(new Map(Object.entries(contents)), blobPaths);
  const read = async (path: string) => {
    const item = tree.find((t) => t.type === 'blob' && t.path === path);
    if (!item) return null;
    return (await load([item]))[path] ?? null;
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
  const [owner = '', name = ''] = target.full_name.split('/');

  for (let attempt = 0; ; attempt++) {
    let done: { commitSha: string; blobShas: Record<string, string>; changes: FileChanges };
    try {
      const fresh = await readFresh(owner, name, target);
      const built = await build(fresh);
      if (!built.ok) return built;
      const { changes, message } = built.value;
      const res = await githubService.commitFiles(
        owner,
        name,
        target.default_branch,
        changes,
        message,
        { expectedHeadSha: fresh.headSha },
      );
      done = { ...res, changes };
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 1) throw e;
      continue;
    }
    // The commit is on GitHub; a failure mirroring it locally must not look like a failed save.
    try {
      await githubFileStore.applyCommit(done.changes, done.blobShas);
    } catch (e) {
      console.warn('Saved, but the local file tree could not be updated:', e);
    }
    for (const [path, content] of Object.entries(done.changes)) {
      const sha = done.blobShas[path];
      if (content !== null && sha) rememberRepoFile(target.full_name, path, sha, content);
    }
    return { ok: true, value: { commitSha: done.commitSha } };
  }
}
