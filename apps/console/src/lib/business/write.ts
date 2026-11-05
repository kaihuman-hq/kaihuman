import { ConflictError, githubFileStore, githubService, type TreeItem } from '@kaihuman/core';
import {
  type BusinessRepo,
  classifyBusinessPath,
  type FileChanges,
  loadBusinessRepo,
  type Result,
} from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';
import { loadRepoFiles, rememberRepoFile } from '../repo-files';
import { BUSINESS_PROFILE_PATH, BUSINESS_TOOLS_VERSION_PATH, businessTreeItems } from './load';

export const CONFLICT_MESSAGE =
  'Someone else changed the repository at the same time. Reload and try again.';

export type { FileChanges };

/** What a builder sees: the repository as it is right now, not as the page last loaded it. */
export type Fresh = {
  headSha: string;
  tree: TreeItem[];
  repo: BusinessRepo;
  /**
   * Current content as text, or `null` when the path is not in the fresh tree. Text files only:
   * receipts and PDFs are binary and throw here; read them with `githubService.getFileBytes`.
   */
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
    const kind = classifyBusinessPath(path);
    if (kind.kind === 'receipt' || (kind.kind === 'artifact' && kind.ext === 'pdf')) {
      throw new Error(`Cannot read ${path} as text: it is a binary file (use getFileBytes).`);
    }
    const item = tree.find((t) => t.type === 'blob' && t.path === path);
    if (!item) return null;
    return (await load([item]))[path] ?? null;
  };
  return { headSha, tree, repo, read };
}

/** GitHub can refuse a tree that deletes a path it does not have, so such deletions are dropped. */
function withoutMissingDeletes(fresh: Fresh, changes: FileChanges): FileChanges {
  const present = new Set(fresh.tree.filter((t) => t.type === 'blob').map((t) => t.path));
  return Object.fromEntries(
    Object.entries(changes).filter(([path, content]) => content !== null || present.has(path)),
  );
}

/**
 * A repo with business on older tools gets the current ones in the same commit (ruling S5); a
 * change the builder made to a tool path wins. The check bundle is large, so it loads only here.
 */
async function withToolUpgrade(fresh: Fresh, changes: FileChanges): Promise<FileChanges> {
  if (!fresh.tree.some((t) => t.type === 'blob' && t.path === BUSINESS_PROFILE_PATH))
    return changes;
  const { businessToolUpgrade } = await import('../business-setup');
  return { ...businessToolUpgrade(await fresh.read(BUSINESS_TOOLS_VERSION_PATH)), ...changes };
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
      const { message } = built.value;
      const changes = await withToolUpgrade(
        fresh,
        withoutMissingDeletes(fresh, built.value.changes),
      );
      // Nothing left to change (e.g. only deletions of files already gone): the head is the result.
      if (Object.keys(changes).length === 0)
        return { ok: true, value: { commitSha: fresh.headSha } };
      const res = await githubService.commitFiles(
        owner,
        name,
        target.default_branch,
        changes,
        message,
        { expectedHeadSha: fresh.headSha },
      );
      // Files GitHub refused (the workflow without the `workflow` scope) are not in the commit.
      const skipped = new Set(res.skipped ?? []);
      if (skipped.size > 0)
        console.warn('Committed without (needs the workflow scope):', [...skipped]);
      done = {
        ...res,
        changes: Object.fromEntries(Object.entries(changes).filter(([p]) => !skipped.has(p))),
      };
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
      // Binary has no text form; the cache holds text only, so it is read back from GitHub.
      if (typeof content === 'string' && sha)
        rememberRepoFile(target.full_name, path, sha, content);
    }
    return { ok: true, value: { commitSha: done.commitSha } };
  }
}
