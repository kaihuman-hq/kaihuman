import { authStore, githubService } from '@lifosy/core';
import { getScaffoldFiles, getSkillOnlyFiles, KB_SKILL_VERSION } from './kb-skills';

export type KBFile = { name: string; path: string; sha: string };

function parseRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/') as [string, string];
  return { owner, repo };
}

export async function getInstalledSkillVersion(fullName: string): Promise<string | null> {
  const { owner, repo } = parseRepo(fullName);
  try {
    const { content } = await githubService.getFileContent(owner, repo, '.kh/.skill-version');
    return content.trim();
  } catch {
    return null;
  }
}

export async function isKBInitialized(fullName: string): Promise<boolean> {
  return (await getInstalledSkillVersion(fullName)) !== null;
}

export async function scaffoldKB(fullName: string): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  for (const [path, content] of Object.entries(getScaffoldFiles())) {
    await githubService.upsertRepoFile(
      owner,
      repo,
      path,
      content,
      'chore: scaffold knowledge base',
    );
  }
}

export async function updateSkillsIfNeeded(fullName: string): Promise<boolean> {
  const installed = await getInstalledSkillVersion(fullName);
  if (installed === KB_SKILL_VERSION) return false;
  const { owner, repo } = parseRepo(fullName);
  for (const [path, content] of Object.entries(getSkillOnlyFiles())) {
    await githubService.upsertRepoFile(
      owner,
      repo,
      path,
      content,
      `chore: update KB skills to v${KB_SKILL_VERSION}`,
    );
  }
  return true;
}

export async function listKBDir(fullName: string, dir: 'raw' | 'wiki'): Promise<KBFile[]> {
  const token = authStore.token.value;
  if (!token) return [];
  const res = await fetch(`https://api.github.com/repos/${fullName}/contents/.kh/${dir}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((f: any) => f.type === 'file' && f.name.endsWith('.md') && f.name !== '.gitkeep')
    .map((f: any) => ({ name: f.name as string, path: f.path as string, sha: f.sha as string }));
}
