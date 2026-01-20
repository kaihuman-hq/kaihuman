import { Octokit } from '@octokit/rest';
import { authStore } from '../stores/auth.store.js';

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

  async fetchRepoTree(owner: string, repo: string, branch = 'main') {
    const client = this.getClient();
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

  async getFileContent(owner: string, repo: string, path: string) {
    const client = this.getClient();
    const { data } = await client.repos.getContent({
      owner,
      repo,
      path,
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
}

export const githubService = new GithubService();
