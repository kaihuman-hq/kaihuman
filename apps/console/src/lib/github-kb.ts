import { authStore, githubService } from '@kaihuman/core';
import { BUSINESS_PROFILE_PATH } from './business/load';
import {
  AGENT_INSTRUCTION_FILES,
  getScaffoldFiles,
  getSkillOnlyFiles,
  KB_SKILL_VERSION,
  mergeAgentInstructions,
} from './kb-skills';

export type KBFile = { name: string; path: string; sha: string };

const VERSION_FILE = '.kh/.skill-version';
const BUSINESS_VERSION_FILE = '.kh/business/.tools/version';

function parseRepo(fullName: string): { owner: string; repo: string } {
  const slash = fullName.indexOf('/');
  if (slash === -1) throw new Error(`Invalid repo format: "${fullName}" (expected "owner/repo")`);
  return { owner: fullName.slice(0, slash), repo: fullName.slice(slash + 1) };
}

/** Where kaihuman's files go: the repo's default branch. */
export type KBRepo = { full_name: string; default_branch: string };

/**
 * Brings kaihuman's files in the repo up to date in one commit, so a write that fails halfway
 * leaves nothing behind. Creates set-up files that are missing (never overwriting the user's
 * notes, log or schema), rewrites skills an older version installed, and adds or updates the
 * kaihuman section of `CLAUDE.md` and `AGENTS.md`, keeping the user's own text in both. A repo with
 * business data also gets its check, workflow and skill refreshed.
 *
 * A repo that was never set up gets nothing unless `install` is set: setting up stays the
 * user's choice. Returns `missing` for such a repo, `updated` when it committed, else `current`.
 */
export async function syncKB(
  kbRepo: KBRepo,
  { install = false }: { install?: boolean } = {},
): Promise<'missing' | 'current' | 'updated'> {
  const { owner, repo } = parseRepo(kbRepo.full_name);
  const tree = await githubService.fetchRepoTree(owner, repo, kbRepo.default_branch);
  const present = new Set(tree.map((item) => item.path));
  if (!present.has(VERSION_FILE) && !install) return 'missing';

  const read = async (path: string) =>
    present.has(path) ? (await githubService.getFileContent(owner, repo, path)).content : null;
  const installed = (await read(VERSION_FILE))?.trim() ?? null;
  const skills = getSkillOnlyFiles();
  const writes: Record<string, string> = {};
  for (const [path, content] of Object.entries(getScaffoldFiles())) {
    if (!present.has(path) || (installed !== KB_SKILL_VERSION && path in skills)) {
      writes[path] = content;
    }
  }
  if (
    Object.keys(writes).length > 0 ||
    AGENT_INSTRUCTION_FILES.some((path) => !present.has(path))
  ) {
    for (const path of AGENT_INSTRUCTION_FILES) {
      const existing = await read(path);
      const merged = mergeAgentInstructions(existing);
      if (merged !== existing) writes[path] = merged;
    }
  }
  // Only a repo that enabled business gets its tools, so everyone else's commits stay unchanged.
  // The bundled check is large, so it loads only when a repo needs it.
  if (present.has(BUSINESS_PROFILE_PATH)) {
    const { BUSINESS_TOOLS_VERSION, getBusinessToolFiles } = await import('./business-setup');
    if ((await read(BUSINESS_VERSION_FILE))?.trim() !== BUSINESS_TOOLS_VERSION) {
      Object.assign(writes, getBusinessToolFiles());
    }
  }
  if (Object.keys(writes).length === 0) return 'current';

  const message =
    installed === null
      ? 'chore: set up kaihuman knowledge base and agent skills'
      : `chore: update kaihuman agent skills to v${KB_SKILL_VERSION}`;
  await githubService.commitFiles(owner, repo, kbRepo.default_branch, writes, message);
  return 'updated';
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
