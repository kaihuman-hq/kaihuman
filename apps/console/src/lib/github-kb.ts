import { authStore, githubService } from '@lifosy/core';
import { getScaffoldFiles, getSkillOnlyFiles, KB_SKILL_VERSION } from './kb-skills';

export type KBFile = { name: string; path: string; sha: string };

function parseRepo(fullName: string): { owner: string; repo: string } {
  const slash = fullName.indexOf('/');
  if (slash === -1) throw new Error(`Invalid repo format: "${fullName}" (expected "owner/repo")`);
  return { owner: fullName.slice(0, slash), repo: fullName.slice(slash + 1) };
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

export async function claudeMdExists(fullName: string): Promise<boolean> {
  const { owner, repo } = parseRepo(fullName);
  try {
    await githubService.getFileContent(owner, repo, 'CLAUDE.md');
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldKB(
  fullName: string,
  { skipClaudeMd = false }: { skipClaudeMd?: boolean } = {},
): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  const files = Object.entries(getScaffoldFiles()).filter(
    ([path]) => !(skipClaudeMd && path === 'CLAUDE.md'),
  );
  for (const [path, content] of files) {
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
