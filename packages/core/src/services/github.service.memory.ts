import { Logger } from '../logger.js';
import type { TreeItem } from '../stores/github-file.store.js';
import type { GithubRepo } from '../stores/github-profile.store.js';

import { gitBlobSha } from '../utils/git-blob-sha.js';
import { ConflictError } from './conflict.js';

const logger = new Logger('InMemoryGithubService');

interface MemoryFile {
  content: string;
  sha: string;
}

/** Deterministic, content-derived pseudo-SHA so optimistic-concurrency logic in
 * the file store keeps working without hitting the network. Not cryptographic —
 * it only needs to change whenever content changes. */
function contentSha(path: string, content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const input = `${path}:${content}`;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  // 40 hex chars, sha1-shaped
  return (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(h2 + 1) + hex(h1 + 1)).slice(0, 40);
}

/**
 * Drop-in replacement for {@link GithubService} that operates entirely on an
 * in-memory `Map`. Returns Octokit-shaped responses so the stores can use it
 * without any branching. Used only when `demoMode` is active.
 */
export class InMemoryGithubService {
  private files = new Map<string, MemoryFile>();
  private repos: GithubRepo[] = [];
  private commitCount = 0;

  /** Install seed data. Replaces any previously loaded state. */
  load(files: Record<string, string>, repos: GithubRepo[]): void {
    this.files.clear();
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, { content, sha: contentSha(path, content) });
    }
    this.repos = repos;
    logger.info(`Loaded ${this.files.size} files and ${repos.length} repo(s) into demo store.`);
  }

  /** Remove all in-memory state (used when exiting demo mode). */
  reset(): void {
    this.files.clear();
    this.repos = [];
  }

  async getRepo(_owner: string, repo: string): Promise<GithubRepo> {
    const found = this.repos.find((r) => r.name === repo) ?? this.repos[0];
    if (!found) throw new Error('No demo repository available');
    return found;
  }

  async listRepos(): Promise<GithubRepo[]> {
    return this.repos;
  }

  async fetchRepoTree(
    _owner: string,
    _repo: string,
    _branch = 'main',
    _opts?: { commitSha?: string },
  ): Promise<TreeItem[]> {
    return this.buildTree();
  }

  async getFileContent(
    _owner: string,
    _repo: string,
    path: string,
    _opts?: { ref?: string },
  ): Promise<{ content: string; sha: string }> {
    const file = this.files.get(path);
    if (!file) {
      const err = new Error(`Not Found: ${path}`) as Error & { status: number };
      err.status = 404;
      throw err;
    }
    return { content: file.content, sha: file.sha };
  }

  async getFileBytes(
    _owner: string,
    _repo: string,
    path: string,
    _opts?: { ref?: string },
  ): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`Not found: ${path}`);
    return new TextEncoder().encode(file.content);
  }

  async saveFile(
    _owner: string,
    _repo: string,
    path: string,
    content: string,
    _message: string,
    _sha?: string,
  ): Promise<{ content: { sha: string } }> {
    const sha = contentSha(path, content);
    this.files.set(path, { content, sha });
    return { content: { sha } };
  }

  async deleteFile(
    _owner: string,
    _repo: string,
    path: string,
    _message: string,
    _sha: string,
  ): Promise<Record<string, never>> {
    this.files.delete(path);
    return {};
  }

  async renameFolder(
    _owner: string,
    _repo: string,
    _branch: string,
    oldPrefix: string,
    newPrefix: string,
    items: { path: string; mode: string; type: string; sha: string }[],
  ): Promise<void> {
    for (const item of items) {
      const file = this.files.get(item.path);
      if (!file) continue;
      const newPath = newPrefix + item.path.slice(oldPrefix.length);
      this.files.delete(item.path);
      this.files.set(newPath, { content: file.content, sha: contentSha(newPath, file.content) });
    }
  }

  /** Counter-based fake head: changes on every commit, like a real branch head. */
  async getHeadSha(_owner: string, _repo: string, _branch: string): Promise<string> {
    return String(this.commitCount).padStart(40, '0');
  }

  async commitFiles(
    owner: string,
    repo: string,
    branch: string,
    files: Record<string, string | null>,
    _message: string,
    opts?: { expectedHeadSha?: string },
  ): Promise<{ commitSha: string; blobShas: Record<string, string> }> {
    const head = await this.getHeadSha(owner, repo, branch);
    if (opts?.expectedHeadSha !== undefined && opts.expectedHeadSha !== head) {
      throw new ConflictError(`${branch} moved from ${opts.expectedHeadSha} to ${head}`);
    }
    const blobShas: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        this.files.delete(path);
        continue;
      }
      // Same sha the real service reports, so the tree and blobShas agree.
      const sha = gitBlobSha(content);
      this.files.set(path, { content, sha });
      blobShas[path] = sha;
    }
    this.commitCount++;
    return { commitSha: await this.getHeadSha(owner, repo, branch), blobShas };
  }

  async upsertRepoFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
  ): Promise<{ content: { sha: string } }> {
    return this.saveFile(owner, repo, path, content, message);
  }

  async listCommits(
    _owner: string,
    _repo: string,
    _path?: string,
    _page = 1,
    _perPage = 30,
  ): Promise<unknown[]> {
    // Demo mode has no real history; an empty list keeps the commits view stable.
    return [];
  }

  // Secrets are not exercised in demo mode; these keep the contract satisfied.
  async getActionsPublicKey(
    _owner: string,
    _repo: string,
  ): Promise<{ key_id: string; key: string }> {
    return { key_id: 'demo', key: '' };
  }

  setActionsSecret(): Promise<void> {
    return Promise.resolve();
  }

  /** Derive a GitHub-style recursive tree (blobs + folder entries) from the
   * stored file paths. */
  private buildTree(): TreeItem[] {
    const blobs: TreeItem[] = [];
    const dirs = new Set<string>();

    for (const [path, file] of this.files) {
      blobs.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: file.sha,
        url: '',
        size: file.content.length,
      });
      const segments = path.split('/');
      for (let i = 1; i < segments.length; i++) {
        dirs.add(segments.slice(0, i).join('/'));
      }
    }

    const trees: TreeItem[] = [...dirs].map((path) => ({
      path,
      mode: '040000',
      type: 'tree',
      sha: contentSha(path, '<tree>'),
      url: '',
    }));

    return [...trees, ...blobs].sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });
  }
}

export const inMemoryGithubService = new InMemoryGithubService();
