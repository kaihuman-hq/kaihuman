import { Octokit } from '@octokit/rest';
import { demoMode } from '../demo-mode.js';
import { authStore } from '../stores/auth.store.js';
import type { TreeItem } from '../stores/github-file.store.js';
import { bytesToBase64 } from '../utils/base64.js';
import { gitBlobSha } from '../utils/git-blob-sha.js';
import { ConflictError } from './conflict.js';
import { inMemoryGithubService } from './github.service.memory.js';

// GitHub's GETs are cacheable for 60s. A branch head read through that cache is stale, which
// makes a write think the branch moved (or, worse, build on old state), so refs skip it.
const noStore = {
  request: {
    fetch: (url: string | URL | Request, init?: RequestInit) =>
      fetch(url, { ...init, cache: 'no-store' }),
  },
};

export class GithubService {
  private octokit: Octokit | null = null;

  private getClient(): Octokit {
    const token = authStore.token.value;
    if (!token) {
      throw new Error('Not authenticated');
    }

    if (!this.octokit) {
      this.octokit = new Octokit({
        auth: token,
      });
    } else {
      // Re-authenticate if needed, but Octokit instance is usually good per token.
      // Ideally we should recreate if token changes.
      // For simplicity, let's create a new one if authStore token mismatches existing one's auth?
      // Actually, simplest is to just create it fresh if null, and reset it on logout.
      // But authStore might update token.
      // Let's just create new Octokit(auth: token) every time or cache it based on token.
      this.octokit = new Octokit({ auth: token });
    }
    return this.octokit;
  }

  async getRepo(owner: string, repo: string) {
    const client = this.getClient();
    const { data } = await client.repos.get({ owner, repo });
    return data;
  }

  async listRepos() {
    const client = this.getClient();
    // Fetch authenticated user's repos
    // per_page: 100 to get most recent
    const { data } = await client.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      type: 'all',
    });
    return data;
  }

  /** With `commitSha` the tree of that commit is fetched and the branch ref is not read. */
  async fetchRepoTree(owner: string, repo: string, branch = 'main', opts?: { commitSha?: string }) {
    const client = this.getClient();
    if (opts?.commitSha) {
      // The tree endpoint resolves a commit sha to its tree.
      const { data } = await client.git.getTree({
        owner,
        repo,
        tree_sha: opts.commitSha,
        recursive: 'true',
      });
      return data.tree;
    }
    // Get the reference for the branch to find the commit SHA
    // Or just use the branch name in getTree if supported?
    // git/trees/:tree_sha supports recursive=true

    // 1. Get branch head sha
    const { data: refData } = await client.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const sha = refData.object.sha;

    // 2. Fetch tree recursively
    const { data: treeData } = await client.git.getTree({
      owner,
      repo,
      tree_sha: sha,
      recursive: 'true',
    });

    return treeData.tree;
  }

  /**
   * The recursive tree of one commit with GitHub's `truncated` flag, which `fetchRepoTree` drops:
   * past GitHub's limit (100,000 entries or 7 MB) the list is partial, and a caller that must see
   * every file has to know.
   */
  async fetchCommitTree(
    owner: string,
    repo: string,
    commitSha: string,
  ): Promise<{ tree: TreeItem[]; truncated: boolean }> {
    const { data } = await this.getClient().git.getTree({
      owner,
      repo,
      tree_sha: commitSha,
      recursive: 'true',
    });
    return { tree: data.tree as TreeItem[], truncated: data.truncated };
  }

  /** With `ref` (a commit sha) the file is read as of that commit, which never changes. */
  async getFileContent(owner: string, repo: string, path: string, opts?: { ref?: string }) {
    const client = this.getClient();
    const { data } = await client.repos.getContent({
      owner,
      repo,
      path,
      ...(opts?.ref ? { ref: opts.ref } : {}),
    });

    if (Array.isArray(data)) {
      throw new Error('Path is a directory, expected a file');
    }

    // data.content is base64
    if (data.type !== 'file') {
      throw new Error(`Path is not a file: ${data.type}`);
    }

    // decode base64 -> binary string -> bytes -> utf-8 string
    const binaryString = atob(data.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    const content = new TextDecoder().decode(bytes);
    return { content, sha: data.sha };
  }

  /**
   * Raw bytes of a file, binary-safe (getFileContent decodes UTF-8 and caps at 1 MB).
   * The blob sha comes from the git trees, walked from the ref's root tree down to the parent
   * folder: the contents API refuses files over 1 MB with the default JSON media type, and its
   * folder listing stops at 1000 entries (S12). A tree lists every entry with its sha and no body;
   * the blob API then serves up to 100 MB.
   */
  async getFileBytes(
    owner: string,
    repo: string,
    path: string,
    opts?: { ref?: string },
  ): Promise<Uint8Array> {
    const client = this.getClient();
    const segments = path.split('/');
    const name = segments.pop() ?? '';
    const notFound = () => new Error(`Not found: ${path}`);
    const is404 = (e: unknown) => (e as { status?: number }).status === 404;

    // `tree_sha` takes a commit sha or a branch or tag name and resolves it to its root tree.
    let treeSha = opts?.ref ?? (await client.repos.get({ owner, repo })).data.default_branch;
    const treeOf = async (sha: string) => {
      try {
        return (await client.git.getTree({ owner, repo, tree_sha: sha })).data.tree;
      } catch (e) {
        throw is404(e) ? notFound() : e;
      }
    };
    for (const segment of segments) {
      const folder = (await treeOf(treeSha)).find((item) => item.path === segment);
      if (!folder || folder.type !== 'tree' || !folder.sha) throw notFound();
      treeSha = folder.sha;
    }
    const entry = (await treeOf(treeSha)).find((item) => item.path === name);
    if (!entry?.sha) throw notFound();
    // Named as the contents API names them, which callers and messages already know.
    const kind =
      entry.type === 'tree'
        ? 'dir'
        : entry.type === 'commit'
          ? 'submodule'
          : entry.mode === '120000'
            ? 'symlink'
            : 'file';
    if (kind !== 'file') throw new Error(`Path is not a file: ${kind}`);

    let blob: { content: string; encoding: string };
    try {
      ({ data: blob } = await client.git.getBlob({ owner, repo, file_sha: entry.sha }));
    } catch (e) {
      throw is404(e) ? notFound() : e;
    }
    if (blob.encoding !== 'base64') {
      throw new Error(`Unexpected blob encoding: ${blob.encoding}`);
    }
    // atob, not TextDecoder: the bytes are not text.
    const binary = atob(blob.content.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async saveFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
  ) {
    const client = this.getClient();

    // We need base64 content, preserving UTF-8
    const bytes = new TextEncoder().encode(content);
    const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    const base64Content = btoa(binaryString);

    const { data } = await client.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: base64Content,
      sha, // Provide SHA to update, omit to create (will fail if exists)
    });

    return data;
  }

  async deleteFile(owner: string, repo: string, path: string, message: string, sha: string) {
    const client = this.getClient();
    const { data } = await client.repos.deleteFile({
      owner,
      repo,
      path,
      message,
      sha,
    });
    return data;
  }

  /**
   * Atomically renames all blobs under oldPrefix/ to newPrefix/ using the Git Trees API.
   * Produces a single commit regardless of how many files are renamed.
   * Items must be the already-known tree blobs (with SHAs) — no extra fetch needed.
   */
  async renameFolder(
    owner: string,
    repo: string,
    branch: string,
    oldPrefix: string,
    newPrefix: string,
    items: { path: string; mode: string; type: string; sha: string }[],
  ) {
    const client = this.getClient();

    // 1. Get current HEAD commit SHA
    const { data: refData } = await client.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const headSha = refData.object.sha;

    // 2. Get the tree SHA for the current commit
    const { data: commitData } = await client.git.getCommit({
      owner,
      repo,
      commit_sha: headSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 3. Build the delta: add files at new prefix, delete files at old prefix
    const treeEntries: {
      path: string;
      mode: '100644' | '100755' | '040000' | '160000' | '120000';
      type: 'blob' | 'tree' | 'commit';
      sha: string | null;
    }[] = [];

    for (const item of items) {
      if (!item.sha) continue; // skip uncommitted local files
      const relativePath = item.path.slice(oldPrefix.length + 1); // strip "oldPrefix/"
      // Add at new location
      treeEntries.push({
        path: `${newPrefix}/${relativePath}`,
        mode: item.mode as '100644',
        type: item.type as 'blob',
        sha: item.sha,
      });
      // Delete from old location (sha: null means deletion)
      treeEntries.push({
        path: item.path,
        mode: item.mode as '100644',
        type: item.type as 'blob',
        sha: null,
      });
    }

    if (treeEntries.length === 0) return;

    // 4. Create new tree based on the current one
    const { data: newTree } = await client.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeEntries,
    });

    // 5. Create a new commit
    const { data: newCommit } = await client.git.createCommit({
      owner,
      repo,
      message: `chore: migrate ${oldPrefix} → ${newPrefix}`,
      tree: newTree.sha,
      parents: [headSha],
    });

    // 6. Advance the branch ref
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });
  }

  /** Current commit SHA of a branch. */
  async getHeadSha(owner: string, repo: string, branch: string): Promise<string> {
    const client = this.getClient();
    const { data } = await client.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      ...noStore,
    });
    return data.object.sha;
  }

  /**
   * Writes and deletes (`null`) several files in a single commit, so the branch gets all of them
   * or none: a write that fails halfway leaves nothing behind. With `expectedHeadSha` it throws
   * {@link ConflictError} before creating anything when the branch has moved; a ref update GitHub
   * rejects as non-fast-forward is a ConflictError too. `blobShas` maps each written path to its
   * new blob SHA.
   */
  async commitFiles(
    owner: string,
    repo: string,
    branch: string,
    files: Record<string, string | Uint8Array | null>,
    message: string,
    opts?: { expectedHeadSha?: string },
  ): Promise<{ commitSha: string; blobShas: Record<string, string> }> {
    const client = this.getClient();
    const { data: refData } = await client.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      ...noStore,
    });
    const headSha = refData.object.sha;
    if (opts?.expectedHeadSha !== undefined && opts.expectedHeadSha !== headSha) {
      throw new ConflictError(`${branch} moved from ${opts.expectedHeadSha} to ${headSha}`);
    }
    const { data: commitData } = await client.git.getCommit({
      owner,
      repo,
      commit_sha: headSha,
    });
    // Binary content cannot travel as tree `content` (that is UTF-8 text), so it is uploaded as a
    // blob first and referenced by sha. All blobs exist before the tree, so a failed upload leaves
    // the branch untouched.
    const entries = await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const base = { path, mode: '100644' as const, type: 'blob' as const };
        if (content === null) return { ...base, sha: null };
        if (typeof content === 'string') return { ...base, content };
        const { data: blob } = await client.git.createBlob({
          owner,
          repo,
          content: bytesToBase64(content),
          encoding: 'base64',
        });
        return { ...base, sha: blob.sha };
      }),
    );
    const { data: newTree } = await client.git.createTree({
      owner,
      repo,
      base_tree: commitData.tree.sha,
      tree: entries,
    });
    const { data: newCommit } = await client.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [headSha],
    });
    try {
      await client.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 422 can also be another ref validation error; treating it as a conflict only costs a retry.
      if (status === 409 || status === 422) {
        throw new ConflictError(`${branch} moved while the commit was built`);
      }
      throw e;
    }
    // createTree lists only top-level entries, so compute the blob SHAs locally.
    const blobShas: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (content !== null) blobShas[path] = gitBlobSha(content);
    }
    return { commitSha: newCommit.sha, blobShas };
  }

  /** Create or update a file, fetching the current SHA automatically when needed. */
  async upsertRepoFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
  ) {
    let sha: string | undefined;
    try {
      const existing = await this.getFileContent(owner, repo, path);
      sha = existing.sha;
    } catch {
      // File does not exist yet — create it
    }
    return this.saveFile(owner, repo, path, content, message, sha);
  }

  async getActionsPublicKey(owner: string, repo: string): Promise<{ key_id: string; key: string }> {
    const client = this.getClient();
    const { data } = await client.rest.actions.getRepoPublicKey({ owner, repo });
    return { key_id: data.key_id, key: data.key };
  }

  async setActionsSecret(
    owner: string,
    repo: string,
    secretName: string,
    encryptedValue: string,
    keyId: string,
  ) {
    const client = this.getClient();
    await client.rest.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secretName,
      encrypted_value: encryptedValue,
      key_id: keyId,
    });
  }

  async listCommits(owner: string, repo: string, path?: string, page = 1, perPage = 30) {
    const client = this.getClient();
    const { data } = await client.repos.listCommits({
      owner,
      repo,
      path,
      page,
      per_page: perPage,
    });
    return data;
  }
}

const realGithubService = new GithubService();

/**
 * Public service handle used by all stores. In demo mode every call is routed
 * transparently to the in-memory implementation; otherwise it hits GitHub via
 * Octokit. Implemented as a Proxy so the routing decision is made per call and
 * no store needs to branch on demo mode.
 */
export const githubService = new Proxy(realGithubService, {
  get(target, prop) {
    const impl: object = demoMode.value ? inMemoryGithubService : target;
    const value = Reflect.get(impl, prop, impl);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(impl)
      : value;
  },
});
