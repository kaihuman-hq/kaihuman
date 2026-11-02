import { githubService } from '@kaihuman/core';
import {
  type BusinessProfile,
  KEY_ORDER,
  stringifyYaml,
  validateProfile,
} from '@kaihuman/formats/business';
import BUSINESS_WORKFLOW from '@kaihuman/formats/business-templates/business-check.yml?raw';
import VERFAHRENSDOKUMENTATION from '@kaihuman/formats/business-templates/VERFAHRENSDOKUMENTATION.md?raw';
import BUSINESS_CHECK from '@kaihuman/formats/dist/business-check.mjs?raw';
import KH_BUSINESS_SKILL from '@kaihuman/formats/skills/kh-business/SKILL.md?raw';
import { AlreadyEnabledError, PublicRepoError } from './business/errors';
import type { KBRepo } from './github-kb';

/** Bump when the check, workflow or skill changes: `syncKB` then rewrites the tool files. */
export const BUSINESS_TOOLS_VERSION = '1.0.0';

export const BUSINESS_PROFILE_PATH = '.kh/business/business.yaml';

const DATA_DIRS = ['clients', 'drafts', 'offers', 'invoices', 'time', 'payments', 'expenses'];

export { AlreadyEnabledError, PublicRepoError };

/** The files an update rewrites: the check, its workflow and the agent skill. */
export function getBusinessToolFiles(): Record<string, string> {
  return {
    '.kh/business/.tools/version': BUSINESS_TOOLS_VERSION,
    '.kh/business/.tools/business-check.mjs': BUSINESS_CHECK,
    '.kh/business/SKILL.md': KH_BUSINESS_SKILL,
    '.agents/skills/kh-business/SKILL.md': KH_BUSINESS_SKILL,
    '.claude/skills/kh-business/SKILL.md': KH_BUSINESS_SKILL,
    '.github/workflows/business-check.yml': BUSINESS_WORKFLOW,
  };
}

/** Everything a new business needs: tool files plus the user's own data skeleton. */
export function getBusinessScaffoldFiles(profile: BusinessProfile): Record<string, string> {
  return {
    ...getBusinessToolFiles(),
    [BUSINESS_PROFILE_PATH]: stringifyYaml(profile, KEY_ORDER.profile),
    '.kh/business/VERFAHRENSDOKUMENTATION.md': VERFAHRENSDOKUMENTATION,
    ...Object.fromEntries(DATA_DIRS.map((dir) => [`.kh/business/${dir}/.gitkeep`, ''])),
    '.kh/business/events.jsonl': '',
    '.kh/business/links.jsonl': '',
  };
}

/**
 * Creates the business skeleton in one commit. Refuses a public repo, because it will hold
 * invoices and client data, and a repo that already has a profile, so nothing is overwritten.
 */
export async function enableBusiness(kbRepo: KBRepo, profile: BusinessProfile): Promise<void> {
  const checked = validateProfile(profile);
  if (!checked.ok) {
    throw new Error(`Invalid business profile: ${checked.issues.map((i) => i.message).join('; ')}`);
  }
  const slash = kbRepo.full_name.indexOf('/');
  const owner = kbRepo.full_name.slice(0, slash);
  const repo = kbRepo.full_name.slice(slash + 1);
  const info = await githubService.getRepo(owner, repo);
  if (info.private !== true) {
    throw new PublicRepoError(`${kbRepo.full_name} is public; business data needs a private repo`);
  }
  const tree = await githubService.fetchRepoTree(owner, repo, kbRepo.default_branch);
  if (tree.some((item) => item.path === BUSINESS_PROFILE_PATH)) {
    throw new AlreadyEnabledError(`${kbRepo.full_name} already has business data`);
  }
  await githubService.commitFiles(
    owner,
    repo,
    kbRepo.default_branch,
    getBusinessScaffoldFiles(profile),
    'chore: enable kaihuman business',
  );
}
