import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug } from '../ids.js';
import { loadBusinessRepo } from '../repo.js';
import { setClientStage } from './stage.js';

const files = loadFixtureRepo();
const repo = loadBusinessRepo(files);
const PATH = '.kh/business/clients/acme-gmbh/client.yaml';
const acme = 'acme-gmbh' as Slug;

describe('setClientStage', () => {
  const text = files.get(PATH) ?? '';

  it('changes only the stage line of a hand-edited file', () => {
    const edited = `# Our biggest client\n${text
      .replace(
        '  street: Hauptstrasse 5\n  postcode: "80331"\n',
        '  postcode: "80331" # HQ\n  street: Hauptstrasse 5\n',
      )
      .replace('stage: active', 'stage: active # since 2025')}`;
    const r = setClientStage(repo, acme, 'past', edited);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.value.changes).toEqual({
      [PATH]: edited.replace('stage: active # since 2025', 'stage: past # since 2025'),
    });
    expect(r.value.message).toBe('business: acme-gmbh → past');
  });

  it('refuses the same stage, an unknown client and a file that no longer validates', () => {
    expect(setClientStage(repo, acme, 'active', text)).toEqual({
      ok: false,
      issues: [{ path: 'stage', message: 'acme-gmbh is already active.' }],
    });
    expect(setClientStage(repo, 'nobody' as Slug, 'past', text).ok).toBe(false);
    expect(setClientStage(repo, acme, 'past', 'name: [').ok).toBe(false);
    expect(setClientStage(repo, acme, 'past', `${text}bogus: 1\n`).ok).toBe(false);
  });
});
