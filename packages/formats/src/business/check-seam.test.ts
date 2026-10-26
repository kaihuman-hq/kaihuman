import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Change, checkBusinessRepo } from './check.js';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Ulid } from './ids.js';
import { type FileChanges, issue } from './issue.js';
import { draftPath } from './paths.js';
import { type BusinessProfile, type Client, type Draft, KEY_ORDER } from './records.js';
import { validateClient, validateDraft, validateProfile } from './validate.js';
import type { Result } from './validate-kit.js';
import { parseYaml, stringifyYaml } from './yaml.js';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '../..');
const root = '.kh/business';
const today = '2026-10-27';
const fixture = loadFixtureRepo();

const read = <T>(text: string | undefined, validate: (raw: unknown) => Result<T>): T => {
  const parsed = parseYaml(text ?? '');
  const r = parsed.ok ? validate(parsed.value) : parsed;
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};
const profileText = fixture.get(`${root}/business.yaml`);
const profile: BusinessProfile = read(profileText, validateProfile);
const client: Client = read(fixture.get(`${root}/clients/acme-gmbh/client.yaml`), (r) =>
  validateClient(r, 'acme-gmbh'),
);

describe('scaffold layout', () => {
  it('passes the check with no errors and no warnings', () => {
    // Same paths and contents as getBusinessScaffoldFiles in apps/console/src/lib/business-setup.ts.
    const skill = readFileSync(join(pkg, 'skills/kh-business/SKILL.md'), 'utf8');
    const files = new Map<string, string>([
      [`${root}/.tools/version`, '1.0.0'],
      [`${root}/.tools/business-check.mjs`, '// bundled check'],
      [`${root}/SKILL.md`, skill],
      ['.agents/skills/kh-business/SKILL.md', skill],
      ['.claude/skills/kh-business/SKILL.md', skill],
      [
        '.github/workflows/business-check.yml',
        readFileSync(join(pkg, 'business-templates/business-check.yml'), 'utf8'),
      ],
      [`${root}/business.yaml`, stringifyYaml(profile, KEY_ORDER.profile)],
      [
        `${root}/VERFAHRENSDOKUMENTATION.md`,
        readFileSync(join(pkg, 'business-templates/VERFAHRENSDOKUMENTATION.md'), 'utf8'),
      ],
      ...['clients', 'drafts', 'offers', 'invoices', 'time', 'payments', 'expenses'].map(
        (dir) => [`${root}/${dir}/.gitkeep`, ''] as [string, string],
      ),
      [`${root}/events.jsonl`, ''],
      [`${root}/links.jsonl`, ''],
    ]);
    expect(checkBusinessRepo({ files, changes: null, today })).toEqual([]);
  });
});

/** Applies `issue()`'s changes the way a commit would and lists them as git name-status. */
const commit = (
  files: ReadonlyMap<string, string>,
  changes: FileChanges,
): { files: Map<string, string>; changes: Change[] } => {
  const next = new Map(files);
  const list: Change[] = [];
  for (const [path, content] of Object.entries(changes)) {
    if (content === null) {
      next.delete(path);
      list.push({ status: 'D', path });
    } else {
      list.push({ status: files.has(path) ? 'M' : 'A', path });
      next.set(path, content);
    }
  }
  return { files: next, changes: list };
};

const numbersIn = (files: ReadonlyMap<string, string>, folder: 'invoices' | 'offers') =>
  [...files.keys()]
    .filter((p) => p.startsWith(`${root}/${folder}/`) && p.endsWith('.yaml'))
    .map((p) => p.slice(p.lastIndexOf('/') + 1, -'.yaml'.length));

/** Writes the draft into the repo, issues it, commits the result and checks the commit. */
const issueAndCheck = (files: Map<string, string>, draft: Draft, creditNotes: string[] = []) => {
  files.set(draftPath(draft.id), stringifyYaml(draft, KEY_ORDER.draft));
  expect(checkBusinessRepo({ files, changes: null, today })).toEqual([]);
  const timeFiles = Object.fromEntries([...files].filter(([p]) => p.startsWith(`${root}/time/`)));
  const r = issue({
    draft,
    profile,
    client,
    existingNumbers: numbersIn(files, draft.kind === 'offer' ? 'offers' : 'invoices'),
    creditNoteNumbers: creditNotes,
    issueDate: today,
    timeFiles,
    clientLog: files.get(`${root}/clients/acme-gmbh/log.actionlog.md`) ?? null,
    now: new Date(2026, 9, 27, 10, 0, 0),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const next = commit(files, r.value.changes);
  expect(checkBusinessRepo({ files: next.files, changes: next.changes, today })).toEqual([]);
  return { number: r.value.document.number, files: next.files };
};

describe('issue() output passes the repo check', () => {
  const fixtureDraft = read(
    fixture.get(`${root}/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml`),
    validateDraft,
  );
  const entryId = '01M5KA3Q00W16BGNTZ49EKRX30' as Ulid;
  const timeFile = `${root}/time/2026-10.jsonl`;
  const unbilled = `{"id":"${entryId}","date":"2026-10-26","minutes":120,"client":"acme-gmbh","project":"website","note":"Review"}\n`;
  const start = () => {
    const files = new Map(fixture);
    files.delete(draftPath(fixtureDraft.id));
    files.set(timeFile, `${files.get(timeFile)}${unbilled}`);
    return files;
  };
  const invoiceDraft: Draft = {
    ...fixtureDraft,
    id: '01M5KA3Q00W16BGNTZ49EKRX31' as Ulid,
    time_entries: [entryId],
  };

  it('for an invoice that bills time, then a credit note of it', () => {
    const invoice = issueAndCheck(start(), invoiceDraft);
    expect(invoice.number).toBe('RE-2026-0002');
    expect(invoice.files.get(timeFile)).toContain(`"invoice":"RE-2026-0002"`);
    const { time_entries: _t, ...rest } = invoiceDraft;
    const credit = issueAndCheck(invoice.files, {
      ...rest,
      id: '01M5KA3Q00W16BGNTZ49EKRX32' as Ulid,
      kind: 'credit-note',
      corrects: invoice.number,
    });
    expect(credit.number).toBe('RE-2026-0003');
  });

  it('for an offer', () => {
    const { time_entries: _t, service_period: _p, ...rest } = fixtureDraft;
    const offer = issueAndCheck(start(), {
      ...rest,
      id: '01M5KA3Q00W16BGNTZ49EKRX33' as Ulid,
      kind: 'offer',
      valid_until: '2026-11-30',
    });
    expect(offer.number).toBe('AN-2026-002');
  });
});
