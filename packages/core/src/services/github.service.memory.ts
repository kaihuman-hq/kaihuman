import { Logger } from '../logger.js';
import type { TreeItem } from '../stores/github-file.store.js';
import type { GithubRepo } from '../stores/github-profile.store.js';

import { gitBlobSha } from '../utils/git-blob-sha.js';
import { ConflictError } from './conflict.js';

const logger = new Logger('InMemoryGithubService');

interface MemoryFile {
  /** '' for a binary file; read it with `getFileBytes`. */
  content: string;
  bytes?: Uint8Array;
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

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/**
 * Drop-in replacement for {@link GithubService} that operates entirely on an
 * in-memory `Map`. Returns Octokit-shaped responses so the stores can use it
 * without any branching. Used only when `demoMode` is active.
 */
export class InMemoryGithubService {
  private files = new Map<string, MemoryFile>();
  /** Every blob ever written, by sha. Blobs are immutable in git, so old shas stay readable. */
  private blobs = new Map<string, string | Uint8Array>();
  /** Snapshot served by `getFileContent` while stale reads are on. */
  private staleFiles: Map<string, MemoryFile> | null = null;
  private repos: GithubRepo[] = [];
  private commitCount = 0;

  /** Install seed data. Replaces any previously loaded state. */
  load(files: Record<string, string>, repos: GithubRepo[]): void {
    this.files.clear();
    this.blobs.clear();
    for (const [path, content] of Object.entries(files)) {
      this.put(path, { content, sha: contentSha(path, content) });
    }
    this.repos = repos;
    logger.info(`Loaded ${this.files.size} files and ${repos.length} repo(s) into demo store.`);
  }

  /** Remove all in-memory state (used when exiting demo mode). */
  reset(): void {
    this.files.clear();
    this.blobs.clear();
    this.staleFiles = null;
    this.repos = [];
  }

  private put(path: string, file: MemoryFile): void {
    this.files.set(path, file);
    this.blobs.set(file.sha, file.bytes ?? file.content);
  }

  /**
   * Test hook: while on, `getFileContent` serves the files as they were when this was switched
   * on, like a cached by-path read. The real service bypasses the HTTP cache (no-store), so store
   * code must never rely on a by-path read being stale OR fresh beyond what the sha check enforces.
   */
  setStaleReads(on: boolean): void {
    this.staleFiles = on ? new Map(this.files) : null;
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

  async fetchCommitTree(
    _owner: string,
    _repo: string,
    _commitSha: string,
  ): Promise<{ tree: TreeItem[]; truncated: boolean }> {
    return { tree: this.buildTree(), truncated: false };
  }

  async getFileContent(
    _owner: string,
    _repo: string,
    path: string,
    _opts?: { ref?: string },
  ): Promise<{ content: string; sha: string }> {
    const file = (this.staleFiles ?? this.files).get(path);
    if (!file) throw httpError(404, `Not Found: ${path}`);
    return { content: file.content, sha: file.sha };
  }

  async getFileBytes(
    _owner: string,
    _repo: string,
    path: string,
    _opts?: { ref?: string },
  ): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) {
      const isFolder = [...this.files.keys()].some((p) => p.startsWith(`${path}/`));
      throw new Error(isFolder ? 'Path is not a file: dir' : `Not found: ${path}`);
    }
    return file.bytes ?? new TextEncoder().encode(file.content);
  }

  async getBlobBytes(_owner: string, _repo: string, sha: string): Promise<Uint8Array> {
    const blob = this.blobs.get(sha);
    if (blob === undefined) throw new Error(`Not found: blob ${sha}`);
    return typeof blob === 'string' ? new TextEncoder().encode(blob) : blob;
  }

  async saveFile(
    _owner: string,
    _repo: string,
    path: string,
    content: string,
    _message: string,
    sha?: string,
  ): Promise<{ content: { sha: string } }> {
    const existing = this.files.get(path);
    if (existing) {
      // Same statuses GitHub answers with: 422 for a missing sha, 409 for a stale one.
      if (!sha) throw httpError(422, `"sha" wasn't supplied: ${path} exists`);
      if (sha !== existing.sha) throw httpError(409, `${path} does not match ${sha}`);
    }
    const next = contentSha(path, content);
    this.put(path, { content, sha: next });
    return { content: { sha: next } };
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
      // Binary content is hashed as bytes; text keeps the demo's path-derived pseudo sha.
      const sha = file.bytes ? gitBlobSha(file.bytes) : contentSha(newPath, file.content);
      this.put(newPath, { ...file, sha });
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
    files: Record<string, string | Uint8Array | null>,
    _message: string,
    opts?: { expectedHeadSha?: string },
  ): Promise<{ commitSha: string; blobShas: Record<string, string>; skipped?: string[] }> {
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
      this.put(
        path,
        typeof content === 'string' ? { content, sha } : { content: '', bytes: content, sha },
      );
      blobShas[path] = sha;
    }
    this.commitCount++;
    return { commitSha: await this.getHeadSha(owner, repo, branch), blobShas };
  }

  async upsertRepoFile(
    owner: string,
    repo: string,
    path: string,
    content: string | ((current: string | null) => string),
    message: string,
  ): Promise<{ content: { sha: string } }> {
    for (let attempt = 1; ; attempt++) {
      const existing = this.files.get(path);
      const current = existing ? existing.content : null;
      const next = typeof content === 'function' ? content(current) : content;
      if (existing && next === current) return { content: { sha: existing.sha } };
      try {
        return await this.saveFile(owner, repo, path, next, message, existing?.sha);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if ((status !== 409 && status !== 422) || attempt >= 3) throw e;
      }
    }
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
