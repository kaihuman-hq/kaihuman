import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug } from '../ids.js';
import { loadBusinessRepo } from '../repo.js';
import { parseYaml } from '../yaml.js';
import { setClientStage } from './stage.js';

const files = loadFixtureRepo();
const repo = loadBusinessRepo(files);
const PATH = '.kh/business/clients/acme-gmbh/client.yaml';
const acme = 'acme-gmbh' as Slug;

describe('setClientStage', () => {
  it('changes only the stage', () => {
    const r = setClientStage(repo, acme, 'past');
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const written = r.value.changes[PATH];
    if (typeof written !== 'string') throw new Error('client.yaml');
    const before = parseYaml(files.get(PATH) ?? '');
    if (!before.ok) throw new Error('fixture');
    expect(parseYaml(written)).toEqual({
      ok: true,
      value: { ...(before.value as object), stage: 'past' },
    });
    // Top-level lines keep their order; nested maps follow the writer's alphabetical rule.
    const tops = (t: string) => t.split('\n').filter((l) => /^[a-z_]+:/.test(l));
    expect(tops(written)).toEqual(
      tops(files.get(PATH) ?? '').map((l) => (l === 'stage: active' ? 'stage: past' : l)),
    );
    expect(Object.keys(r.value.changes)).toEqual([PATH]);
    expect(r.value.message).toBe('business: acme-gmbh → past');
  });

  it('refuses the same stage and an unknown client', () => {
    expect(setClientStage(repo, acme, 'active')).toEqual({
      ok: false,
      issues: [{ path: 'stage', message: 'acme-gmbh is already active.' }],
    });
    expect(setClientStage(repo, 'nobody' as Slug, 'past').ok).toBe(false);
  });
});
