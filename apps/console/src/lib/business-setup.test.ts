import { type BusinessProfile, parseYaml, validateProfile } from '@kaihuman/formats/business';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AlreadyEnabledError,
  BUSINESS_TOOLS_VERSION,
  enableBusiness,
  getBusinessScaffoldFiles,
  getBusinessToolFiles,
  PublicRepoError,
} from './business-setup';

vi.mock('@kaihuman/core', () => ({
  githubService: {
    getRepo: vi.fn(),
    fetchRepoTree: vi.fn(),
    getFileContent: vi.fn(),
    commitFiles: vi.fn(),
  },
}));

import { githubService } from '@kaihuman/core';

const repo = { full_name: 'owner/repo', default_branch: 'main' };

const profile: BusinessProfile = {
  name: 'Kai Mustermann',
  address: { street: 'Musterstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE' },
  vat_id: 'DE123456789',
  contact: { name: 'Kai Mustermann', email: 'kai@example.com' },
  bank: { iban: 'DE89370400440532013000' },
  jurisdiction: 'de',
  vat_regime: 'regular',
  currency: 'EUR',
  language: 'de',
  payment_terms_days: 14,
  default_vat_rate: '19',
};

function givenRepo(info: { private: boolean }, files: Record<string, string>) {
  vi.mocked(githubService.getRepo).mockResolvedValue(info as never);
  vi.mocked(githubService.fetchRepoTree).mockResolvedValue(
    Object.keys(files).map((path) => ({ path, type: 'blob' })) as never,
  );
}

function committed(): Record<string, string> {
  const calls = vi.mocked(githubService.commitFiles).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]?.[3] as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c', blobShas: {} });
});

describe('enableBusiness', () => {
  it('refuses a public repo and commits nothing', async () => {
    givenRepo({ private: false }, {});
    await expect(enableBusiness(repo, profile)).rejects.toBeInstanceOf(PublicRepoError);
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('refuses a repo that already has business data', async () => {
    givenRepo({ private: true }, { '.kh/business/business.yaml': 'x' });
    await expect(enableBusiness(repo, profile)).rejects.toBeInstanceOf(AlreadyEnabledError);
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('commits the whole skeleton once, with a profile that validates', async () => {
    givenRepo({ private: true }, {});
    await enableBusiness(repo, profile);
    const files = committed();
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '.kh/business/business.yaml',
        '.kh/business/.tools/business-check.mjs',
        '.kh/business/.tools/version',
        '.github/workflows/business-check.yml',
        '.claude/skills/kh-business/SKILL.md',
        '.agents/skills/kh-business/SKILL.md',
        '.kh/business/SKILL.md',
        '.kh/business/VERFAHRENSDOKUMENTATION.md',
        '.kh/business/events.jsonl',
        '.kh/business/links.jsonl',
        '.kh/business/invoices/.gitkeep',
      ]),
    );
    // Bumped with the phase-3 skill and check so syncKB refreshes existing repos.
    expect(BUSINESS_TOOLS_VERSION).toBe('1.3.0');
    expect(files['.kh/business/.tools/version']).toBe(BUSINESS_TOOLS_VERSION);
    const parsed = parseYaml(files['.kh/business/business.yaml'] as string);
    expect(parsed.ok && validateProfile(parsed.value).ok).toBe(true);
    expect(vi.mocked(githubService.commitFiles).mock.calls[0]?.[4]).toBe(
      'chore: enable kaihuman business',
    );
  });

  it('rejects an invalid profile before touching GitHub', async () => {
    givenRepo({ private: true }, {});
    await expect(enableBusiness(repo, { ...profile, currency: 5 } as never)).rejects.toThrow(
      /currency/,
    );
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });
});

describe('business files', () => {
  it('keeps the three skill copies identical', () => {
    const files = getBusinessToolFiles();
    const skill = files['.kh/business/SKILL.md'];
    expect(skill).toContain('name: kh-business');
    expect(files['.agents/skills/kh-business/SKILL.md']).toBe(skill);
    expect(files['.claude/skills/kh-business/SKILL.md']).toBe(skill);
  });

  it('runs the check only for business changes, with the base commit', () => {
    const workflow = getBusinessToolFiles()['.github/workflows/business-check.yml'] as string;
    expect(workflow).toContain("'.kh/business/**'");
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toMatch(
      /BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
    );
    expect(workflow).toContain('node .kh/business/.tools/business-check.mjs --base "$BASE"');
  });

  it('scaffold adds the tool files to the data skeleton', () => {
    const scaffold = getBusinessScaffoldFiles(profile);
    for (const path of Object.keys(getBusinessToolFiles())) expect(scaffold).toHaveProperty(path);
    expect(scaffold['.kh/business/VERFAHRENSDOKUMENTATION.md']).toContain('Steuerberater');
  });
});
