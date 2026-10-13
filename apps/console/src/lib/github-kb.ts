import { authStore, githubService } from '@kaihuman/core';
import {
  AGENT_INSTRUCTION_FILES,
  getScaffoldFiles,
  getSkillOnlyFiles,
  KB_SKILL_VERSION,
  mergeAgentInstructions,
} from './kb-skills';

export type KBFile = { name: string; path: string; sha: string };

const VERSION_FILE = '.kh/.skill-version';

function parseRepo(fullName: string): { owner: string; repo: string } {
  const slash = fullName.indexOf('/');
  if (slash === -1) throw new Error(`Invalid repo format: "${fullName}" (expected "owner/repo")`);
  return { owner: fullName.slice(0, slash), repo: fullName.slice(slash + 1) };
}

export async function getInstalledSkillVersion(fullName: string): Promise<string | null> {
  const { owner, repo } = parseRepo(fullName);
  try {
    const { content } = await githubService.getFileContent(owner, repo, VERSION_FILE);
    return content.trim();
  } catch {
    return null;
  }
}

export async function isKBInitialized(fullName: string): Promise<boolean> {
  return (await getInstalledSkillVersion(fullName)) !== null;
}

/**
 * Adds kaihuman's section to `CLAUDE.md` and `AGENTS.md`, or brings it up to date, keeping the
 * user's own text in both. A file whose text would not change is not written.
 */
export async function writeAgentInstructions(fullName: string, message: string): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  for (const path of AGENT_INSTRUCTION_FILES) {
    const existing = await githubService.getFileContent(owner, repo, path).then(
      (file) => file.content,
      () => null,
    );
    const merged = mergeAgentInstructions(existing);
    if (merged !== existing) await githubService.upsertRepoFile(owner, repo, path, merged, message);
  }
}

export async function scaffoldKB(fullName: string): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  const message = 'chore: scaffold knowledge base';
  // All scaffold files are new (called only when !isKBInitialized), so create
  // directly without a pre-check GET to avoid spurious 404s in the network log.
  for (const [path, content] of Object.entries(getScaffoldFiles())) {
    await githubService.saveFile(owner, repo, path, content, message);
  }
  await writeAgentInstructions(fullName, message);
}

/**
 * For pages other than `/knowledge`: brings installed skills up to date, but never installs them
 * into a repo that has not been set up: setting up stays a choice made on `/knowledge`.
 */
export async function refreshInstalledSkills(
  fullName: string,
): Promise<'missing' | 'current' | 'updated'> {
  if (!(await isKBInitialized(fullName))) return 'missing';
  return (await updateSkillsIfNeeded(fullName)) ? 'updated' : 'current';
}

export async function updateSkillsIfNeeded(fullName: string): Promise<boolean> {
  const installed = await getInstalledSkillVersion(fullName);
  if (installed === KB_SKILL_VERSION) return false;
  const { owner, repo } = parseRepo(fullName);
  const message = `chore: update KB skills to v${KB_SKILL_VERSION}`;
  const files = Object.entries(getSkillOnlyFiles()).filter(([path]) => path !== VERSION_FILE);
  for (const [path, content] of files) {
    await githubService.upsertRepoFile(owner, repo, path, content, message);
  }
  await writeAgentInstructions(fullName, message);
  // Last, so an update that fails halfway is tried again on the next visit.
  await githubService.upsertRepoFile(owner, repo, VERSION_FILE, KB_SKILL_VERSION, message);
  return true;
}

export async function addRawNote(
  fullName: string,
  title: string,
  text: string,
  tags: string[] = ['general'],
): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  const slug =
    title
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .slice(0, 40) || 'note';
  const date = new Date().toISOString().slice(0, 10);
  const escapedTitle = title.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
  const tagList = tags.length > 0 ? tags : ['general'];
  const content = `---\ntitle: "${escapedTitle}"\nurl: ''\ndate: ${date}\nprocessed: false\ntags: [${tagList.join(', ')}]\n---\n\n${text}`;
  const path = `.kh/raw/${Date.now()}-${slug}.md`;
  await githubService.upsertRepoFile(owner, repo, path, content, `note: add "${title}"`);
}

export async function listKBDir(
  fullName: string,
  dir: 'raw' | 'wiki' | 'raw/processed',
): Promise<KBFile[]> {
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
