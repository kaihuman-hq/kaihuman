import { loadBusinessRepo, type TextChanges, type Ulid } from '@kaihuman/formats/business';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRepoFilesCacheForTests } from '../repo-files';
import { loadFixtureRepo } from './fixture.test-helper';
import {
  buildIssueContext,
  frozenClashes,
  issuedNotice,
  issueFromFresh,
  loadedSource,
  previewIssue,
} from './issue-flow';
import { writeBusiness } from './write';

// Lets a test make issue() return an extra change, to prove the frozen-file guard stops it.
const force = vi.hoisted(() => ({ extra: null as string | null }));
vi.mock('@kaihuman/formats/business', async (importOriginal) => {
  const m = await importOriginal<typeof import('@kaihuman/formats/business')>();
  return {
    ...m,
    issue: (ctx: Parameters<typeof m.issue>[0]) => {
      const r = m.issue(ctx);
      if (!r.ok || force.extra === null) return r;
      return { ...r, value: { ...r.value, changes: { ...r.value.changes, [force.extra]: 'x' } } };
    },
  };
});

vi.mock('@kaihuman/core', () => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    githubService: {
      getHeadSha: vi.fn(),
      fetchRepoTree: vi.fn(),
      getFileContent: vi.fn(),
      commitFiles: vi.fn(),
    },
    githubFileStore: { applyCommit: vi.fn() },
  };
});

import { ConflictError, githubService } from '@kaihuman/core';

const ROOT = '.kh/business';
const DRAFT_ID = '01M5KA3Q00W16BGNTZ49EKRX27' as Ulid;
const DRAFT = `${ROOT}/drafts/${DRAFT_ID}.yaml`;
const ENTRY = '01M5B0000038DJQW16BGNTZ49E';
const TIME = `${ROOT}/time/2026-10.jsonl`;
const LOG = `${ROOT}/clients/acme-gmbh/log.actionlog.md`;
const OLD_LOG = '# Log\n\n- 2026-10-26 10:00:00 Sent RE-2026-0001 #business\n';
const issuedAt = (n: string) => `${ROOT}/invoices/2026/${n}.yaml`;
const now = new Date(2026, 10, 2, 9, 30, 0);
const target = { full_name: 'owner/issue-flow', default_branch: 'main' };

/** Fixture repo with RE-2026-0042 issued and the draft billing one unbilled entry. */
const baseFiles = (): Record<string, string> => {
  const m = loadFixtureRepo();
  const invoice = m.get(issuedAt('RE-2026-0001')) ?? '';
  const entry = `{"id":"${ENTRY}","date":"2026-10-20","minutes":120,"client":"acme-gmbh","project":"website","note":"Fixes"}\n`;
  m.set(TIME, (m.get(TIME) ?? '') + entry);
  m.set(DRAFT, (m.get(DRAFT) ?? '').replace('01M581YW00W16BGNTZ49EKRX27', ENTRY));
  m.set(issuedAt('RE-2026-0042'), otherInvoice(invoice, 'RE-2026-0042'));
  m.set(LOG, OLD_LOG);
  return Object.fromEntries(m);
};
const otherInvoice = (template: string, number: string) =>
  template
    .replaceAll('RE-2026-0001', number)
    .replace(/^draft_id: .*$/m, `draft_id: 01M50ARQ007CHPV05AFMSY38D${number.slice(-1)}`);

const sourceOf = (files: Record<string, string>) =>
  loadedSource(loadBusinessRepo(new Map(Object.entries(files)), Object.keys(files)), files);

// A tiny remote, as in write.test.ts: contents by path and a head that moves on every write.
const shaOf = (c: string) => `sha-${c.length}-${c.slice(0, 40)}-${c.slice(-40)}`;
let files: Record<string, string>;
let head: number;
const otherDeviceWrites = (path: string, content: string) => {
  files[path] = content;
  head++;
};
const commits = () =>
  vi.mocked(githubService.commitFiles).mock.calls.map((c) => ({
    changes: c[3] as TextChanges,
    message: c[4],
    expected: c[5],
  }));

beforeEach(() => {
  vi.resetAllMocks();
  force.extra = null;
  __resetRepoFilesCacheForTests();
  files = baseFiles();
  head = 1;
  vi.mocked(githubService.getHeadSha).mockImplementation(async () => `head-${head}`);
  vi.mocked(githubService.fetchRepoTree).mockImplementation((async () =>
    Object.entries(files).map(([path, c]) => ({ path, type: 'blob', sha: shaOf(c) }))) as never);
  vi.mocked(githubService.getFileContent).mockImplementation((async (
    _o: string,
    _r: string,
    path: string,
  ) => ({ content: files[path] ?? '', sha: shaOf(files[path] ?? '') })) as never);
  vi.mocked(githubService.commitFiles).mockResolvedValue({ commitSha: 'c1', blobShas: {} });
});

/** Issues the draft through the real `writeBusiness`, the way IssuePage does. */
const commit = async (issueDate = '2026-11-02') => {
  let number: string | undefined;
  const result = await writeBusiness(target, async (fresh) => {
    const r = await issueFromFresh(fresh, DRAFT_ID, issueDate, now);
    if (r.ok) number = r.value.number;
    return r;
  });
  return { result, number };
};

describe('buildIssueContext', () => {
  it('collects the series numbers of every year from the tree, and the credit notes', async () => {
    const f = {
      ...baseFiles(),
      // Invalid content still blocks its number: only the path counts.
      [`${ROOT}/invoices/2025/RE-2025-0007.yaml`]: 'not: [valid',
    };
    const ctx = await buildIssueContext(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    if (!ctx.ok) throw new Error(JSON.stringify(ctx.issues));
    expect([...ctx.value.existingNumbers].sort()).toEqual([
      'RE-2025-0007',
      'RE-2026-0001',
      'RE-2026-0042',
    ]);
    expect(ctx.value.creditNoteNumbers).toEqual([]);
    expect(Object.keys(ctx.value.timeFiles)).toEqual([TIME]);
    expect(ctx.value.clientLog).toBe(OLD_LOG);
    expect(ctx.value.draft.id).toBe(DRAFT_ID);
  });

  it('lists issued credit notes', async () => {
    const f = baseFiles();
    f[issuedAt('RE-2026-0042')] = (f[issuedAt('RE-2026-0042')] ?? '')
      .replace('type_code: 380', 'type_code: 381')
      .replace('kind: invoice', 'kind: credit-note\ncorrects: RE-2026-0001');
    const ctx = await buildIssueContext(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    expect(ctx.ok && ctx.value.creditNoteNumbers).toEqual(['RE-2026-0042']);
  });

  it('gives a null log when the client has none', async () => {
    const f = baseFiles();
    delete f[LOG];
    const ctx = await buildIssueContext(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    expect(ctx.ok && ctx.value.clientLog).toBeNull();
  });

  it('refuses an unknown draft, an issued draft and an impossible date', async () => {
    const other = '01M5KA3Q00W16BGNTZ49EKRX28' as Ulid;
    expect(await buildIssueContext(sourceOf(baseFiles()), other, '2026-11-02', now)).toEqual({
      ok: false,
      issues: [{ path: 'draft', message: `No draft ${other}.` }],
    });
    const issued = baseFiles();
    delete issued[DRAFT];
    issued[issuedAt('RE-2026-0042')] = (issued[issuedAt('RE-2026-0042')] ?? '').replace(
      /^draft_id: .*$/m,
      `draft_id: ${DRAFT_ID}`,
    );
    expect(await buildIssueContext(sourceOf(issued), DRAFT_ID, '2026-11-02', now)).toEqual({
      ok: false,
      issues: [{ path: 'draft', message: 'This draft was already issued.' }],
    });
    expect(await buildIssueContext(sourceOf(baseFiles()), DRAFT_ID, '2026-02-30', now)).toEqual({
      ok: false,
      issues: [{ path: 'issue_date', message: 'Enter the issue date as YYYY-MM-DD.' }],
    });
  });
});

describe('previewIssue', () => {
  it('shows the next number, totals, due date and legal notes', async () => {
    const p = await previewIssue(sourceOf(baseFiles()), DRAFT_ID, '2026-11-02', now);
    if (!p.ok) throw new Error(JSON.stringify(p.issues));
    expect(p.value).toMatchObject({
      number: 'RE-2026-0043',
      kind: 'invoice',
      client: 'Acme GmbH',
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      currency: 'EUR',
    });
    expect(p.value.totals).toMatchObject({ net: 84250, vat: 15888, gross: 100138 });
    expect(p.value.lines).toHaveLength(3);
    expect(Array.isArray(p.value.legalNotes)).toBe(true);
  });

  it('takes the year of the issue date', async () => {
    const p = await previewIssue(sourceOf(baseFiles()), DRAFT_ID, '2027-01-04', now);
    expect(p.ok && p.value.number).toBe('RE-2027-0001');
  });

  it('passes issue() refusals through (de exemption rule)', async () => {
    const f = baseFiles();
    f[DRAFT] = (f[DRAFT] ?? '').replace('vat_category: S', 'vat_category: Z');
    const p = await previewIssue(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    expect(p.ok).toBe(false);
    expect(!p.ok && p.issues.some((i) => i.path.startsWith('lines'))).toBe(true);
  });

  it('refuses a draft whose time entries are already billed', async () => {
    const f = baseFiles();
    f[TIME] = (f[TIME] ?? '').replace('"note":"Fixes"', '"invoice":"RE-2026-0042","note":"Fixes"');
    const p = await previewIssue(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    expect(!p.ok && p.issues[0]?.message).toBe(
      `time_entries[0]: time entry ${ENTRY} is already billed on RE-2026-0042`,
    );
  });
});

describe('previewIssue warnings (Q12, over-crediting)', () => {
  const warningsFor = async (f: Record<string, string>, date: string) => {
    const p = await previewIssue(sourceOf(f), DRAFT_ID, date, now);
    if (!p.ok) throw new Error(JSON.stringify(p.issues));
    return p.value.warnings;
  };

  it('none for an ordinary issue date', async () => {
    expect(await warningsFor(baseFiles(), '2026-11-02')).toEqual([]);
  });

  it('an issue date before the latest of the series and year is out of order', async () => {
    const f = baseFiles();
    f[issuedAt('RE-2026-0042')] = (f[issuedAt('RE-2026-0042')] ?? '')
      .replace(/^issue_date: .*$/m, 'issue_date: "2026-10-30"')
      .replace(/^due_date: .*$/m, 'due_date: "2026-11-13"');
    expect(await warningsFor(f, '2026-10-28')).toEqual([
      'The issue date is out of order with RE-2026-0042 (2026-10-30). Issue anyway?',
    ]);
    expect(await warningsFor(f, '2026-10-30')).toEqual([]);
  });

  it('more than 7 days ahead is in the future', async () => {
    expect(await warningsFor(baseFiles(), '2026-11-09')).toEqual([]);
    expect(await warningsFor(baseFiles(), '2026-11-10')).toEqual([
      'The issue date is in the future. Issue anyway?',
    ]);
  });

  const creditFiles = (alreadyCredited: number | null) => {
    const f = baseFiles();
    f[DRAFT] = (f[DRAFT] ?? '')
      .replace('kind: invoice', 'kind: credit-note\ncorrects: RE-2026-0001')
      .replace(/time_entries:\n(\s+- .*\n?)+/, '');
    if (alreadyCredited === null) delete f[issuedAt('RE-2026-0042')];
    else {
      f[issuedAt('RE-2026-0042')] = (f[issuedAt('RE-2026-0042')] ?? '')
        .replace('type_code: 380', 'type_code: 381')
        .replace(/^due_date: .*\n/m, '')
        .replace('kind: invoice', 'kind: credit-note\ncorrects: RE-2026-0001')
        .replace(
          /^lines:\n[\s\S]*?(?=^\w)/m,
          `lines:\n  - description: Part\n    quantity: "1"\n    unit: C62\n    unit_price: ${alreadyCredited}\n    vat_category: S\n    vat_rate: "0"\n`,
        )
        .replace(
          /^totals:\n[\s\S]*?(?=^\w)/m,
          `totals:\n  net: ${alreadyCredited}\n  vat: 0\n  gross: ${alreadyCredited}\n  breakdown:\n    - category: S\n      rate: "0"\n      taxable: ${alreadyCredited}\n      tax: 0\n`,
        );
    }
    return f;
  };

  it('a credit note larger than the uncredited rest of the invoice is flagged', async () => {
    expect(await warningsFor(creditFiles(null), '2026-11-02')).toEqual([]);
    expect(await warningsFor(creditFiles(100), '2026-11-02')).toEqual([
      'This credit note is 1.00 EUR more than the amount still open on RE-2026-0001.',
    ]);
  });
});

describe('issuing through writeBusiness', () => {
  it('writes the document, deletes the draft, bills the time and logs, in one commit', async () => {
    const { result, number } = await commit();
    expect(result.ok).toBe(true);
    expect(number).toBe('RE-2026-0043');
    const all = commits();
    expect(all).toHaveLength(1);
    const [only] = all;
    expect(only?.message).toBe('business: issue RE-2026-0043 for acme-gmbh');
    expect(only?.expected).toEqual({ expectedHeadSha: 'head-1' });
    expect(Object.keys(only?.changes ?? {}).sort()).toEqual(
      [issuedAt('RE-2026-0043'), DRAFT, TIME, LOG].sort(),
    );
    expect(only?.changes[DRAFT]).toBeNull();
    expect(only?.changes[issuedAt('RE-2026-0043')]).toContain('number: RE-2026-0043');
    expect(only?.changes[TIME]).toContain(`"id":"${ENTRY}"`);
    expect(only?.changes[TIME]).toMatch(new RegExp(`"id":"${ENTRY}".*"invoice":"RE-2026-0043"`));
    const log = only?.changes[LOG] ?? '';
    expect(log.startsWith(OLD_LOG)).toBe(true);
    expect(log.slice(OLD_LOG.length)).toBe(
      '- 2026-11-02 09:30:00 Issued RE-2026-0043 (1001.38 EUR) #business\n',
    );
  });

  it('Review Focus 4: a retainer draft advances next_date in the issuing commit, once', async () => {
    const PROJECT = `${ROOT}/clients/acme-gmbh/projects/website.yaml`;
    files[PROJECT] =
      `${files[PROJECT]}retainer:\n  amount: 1000\n  interval: monthly\n  next_date: "2026-11-01"\n  description: Care\n`;
    files[DRAFT] = `${files[DRAFT]}from_retainer: "2026-11-01"\n`;
    const first = await commit();
    expect(first.result.ok).toBe(true);
    const [one] = commits();
    expect(one?.changes[PROJECT]).toContain('next_date: 2026-12-01');
    expect(one?.changes[issuedAt('RE-2026-0043')]).not.toContain('from_retainer');

    // A stale second draft for the same period: the project has moved on, so it stays.
    files[PROJECT] = one?.changes[PROJECT] ?? '';
    files[issuedAt('RE-2026-0043')] = one?.changes[issuedAt('RE-2026-0043')] ?? '';
    const second = '01M5KA3Q00W16BGNTZ49EKRX29' as Ulid;
    files[`${ROOT}/drafts/${second}.yaml`] = (baseFiles()[DRAFT] ?? '')
      .replace(DRAFT_ID, second)
      .replace(/time_entries:[\s\S]*$/, 'from_retainer: "2026-11-01"\n');
    head++;
    const again = await writeBusiness(target, (fresh) =>
      issueFromFresh(fresh, second, '2026-11-02', now),
    );
    expect(again.ok).toBe(true);
    expect(Object.keys(commits()[1]?.changes ?? {})).not.toContain(PROJECT);
  });

  it('Review Focus 3: a number taken after the preview yields the next, never an overwrite', async () => {
    const preview = await previewIssue(sourceOf(files), DRAFT_ID, '2026-11-02', now);
    expect(preview.ok && preview.value.number).toBe('RE-2026-0043');
    const theirs = otherInvoice(files[issuedAt('RE-2026-0001')] ?? '', 'RE-2026-0043');
    otherDeviceWrites(issuedAt('RE-2026-0043'), theirs);

    const { result, number } = await commit();
    expect(result.ok).toBe(true);
    expect(number).toBe('RE-2026-0044');
    const [only] = commits();
    expect(only?.changes).not.toHaveProperty(issuedAt('RE-2026-0043'));
    expect(only?.changes[issuedAt('RE-2026-0044')]).toContain('number: RE-2026-0044');
    expect(only?.expected).toEqual({ expectedHeadSha: 'head-2' });
    expect(files[issuedAt('RE-2026-0043')]).toBe(theirs);
  });

  it('Review Focus 3: a number taken between read and commit is rebuilt on the retry', async () => {
    const theirs = otherInvoice(files[issuedAt('RE-2026-0001')] ?? '', 'RE-2026-0043');
    vi.mocked(githubService.commitFiles)
      .mockImplementationOnce(async () => {
        otherDeviceWrites(issuedAt('RE-2026-0043'), theirs);
        throw new ConflictError('moved');
      })
      .mockResolvedValueOnce({ commitSha: 'c2', blobShas: {} });

    const { result, number } = await commit();
    expect(result).toEqual({ ok: true, value: { commitSha: 'c2' } });
    expect(number).toBe('RE-2026-0044');
    const [rejected, landed] = commits();
    expect(rejected?.changes).toHaveProperty(issuedAt('RE-2026-0043'));
    expect(landed?.expected).toEqual({ expectedHeadSha: 'head-2' });
    expect(landed?.changes).not.toHaveProperty(issuedAt('RE-2026-0043'));
    expect(Object.keys(landed?.changes ?? {}).sort()).toEqual(
      [issuedAt('RE-2026-0044'), DRAFT, TIME, LOG].sort(),
    );
  });

  it('commits nothing when issue() refuses', async () => {
    files[DRAFT] = (files[DRAFT] ?? '').replace('vat_category: S', 'vat_category: Z');
    const { result } = await commit();
    expect(result.ok).toBe(false);
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });

  it('commits nothing when another device issued the draft meanwhile', async () => {
    const theirs = otherInvoice(files[issuedAt('RE-2026-0001')] ?? '', 'RE-2026-0043').replace(
      /^draft_id: .*$/m,
      `draft_id: ${DRAFT_ID}`,
    );
    delete files[DRAFT];
    otherDeviceWrites(issuedAt('RE-2026-0043'), theirs);
    const { result } = await commit();
    expect(result).toEqual({
      ok: false,
      issues: [{ path: 'draft', message: 'This draft was already issued.' }],
    });
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });
});

describe('numbers held only by an artifact (Q11)', () => {
  const PDF = `${ROOT}/invoices/2026/RE-2026-0043.pdf`;

  it('count as taken in buildIssueContext', async () => {
    const f = { ...baseFiles(), [PDF]: '%PDF' };
    const ctx = await buildIssueContext(sourceOf(f), DRAFT_ID, '2026-11-02', now);
    expect(ctx.ok && ctx.value.existingNumbers).toContain('RE-2026-0043');
  });

  it('are skipped by the commit: only RE-2026-0043.pdf exists → RE-2026-0044', async () => {
    otherDeviceWrites(PDF, '%PDF');
    const { result, number } = await commit();
    expect(result.ok).toBe(true);
    expect(number).toBe('RE-2026-0044');
    const [only] = commits();
    expect(Object.keys(only?.changes ?? {}).some((p) => p.includes('RE-2026-0043'))).toBe(false);
    expect(files[PDF]).toBe('%PDF');
  });

  it('a frozen clash reaches the caller as a refusal and nothing is committed', async () => {
    force.extra = issuedAt('RE-2026-0042');
    const { result } = await commit();
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: 'number',
          message: `${issuedAt('RE-2026-0042')} already exists; nothing was written.`,
        },
      ],
    });
    expect(githubService.commitFiles).not.toHaveBeenCalled();
  });
});

describe('frozenClashes', () => {
  it('refuses an issued document whose number exists as any frozen file', () => {
    const tree = [
      { path: `${ROOT}/invoices/2026/RE-2026-0043.xml`, type: 'blob' as const },
      { path: `${ROOT}/offers/2026/AN-2026-002.sha256`, type: 'blob' as const },
    ];
    expect(frozenClashes(tree, { [issuedAt('RE-2026-0043')]: 'new' })).toEqual([
      issuedAt('RE-2026-0043'),
    ]);
    expect(frozenClashes(tree, { [`${ROOT}/offers/2026/AN-2026-002.yaml`]: 'new' })).toEqual([
      `${ROOT}/offers/2026/AN-2026-002.yaml`,
    ]);
    expect(frozenClashes(tree, { [issuedAt('RE-2026-0044')]: 'new' })).toEqual([]);
  });

  const tree = [{ path: issuedAt('RE-2026-0042'), type: 'blob' as const }];
  it('reports an existing issued file and any deletion under invoices/ or offers/', () => {
    expect(
      frozenClashes(tree, {
        [issuedAt('RE-2026-0042')]: 'x',
        [issuedAt('RE-2026-0043')]: 'new',
        [`${ROOT}/offers/2026/AN-2026-001.yaml`]: null,
        [`${ROOT}/invoices/2026/RE-2026-0042.pdf`]: null,
        [DRAFT]: null,
      }).sort(),
    ).toEqual(
      [
        issuedAt('RE-2026-0042'),
        `${ROOT}/offers/2026/AN-2026-001.yaml`,
        `${ROOT}/invoices/2026/RE-2026-0042.pdf`,
      ].sort(),
    );
  });
});

describe('issuedNotice', () => {
  it('uses the exact copy', () => {
    expect(issuedNotice('RE-2026-0043')).toBe(
      'Issued RE-2026-0043. Generate the PDF with your generator; kaihuman shows "PDF missing" until it is in the repo.',
    );
  });
});
