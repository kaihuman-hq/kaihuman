import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Ulid } from '../ids.js';
import { EVENTS_PATH } from '../paths.js';
import type { Issued } from '../records.js';
import { type BusinessRepo, loadBusinessRepo } from '../repo.js';
import { validateDraft } from '../validate.js';
import { parseYaml } from '../yaml.js';
import { saveDraft } from './drafts.js';
import { decideOffer, offerToInvoiceDraft } from './offers.js';

const id = '01M5AMBK0038DJQW16BGNTZ49F' as Ulid;
const draftId = '01M5AMBK0038DJQW16BGNTZ49G' as Ulid;
const now = new Date('2026-11-02T10:30:00Z');
const CLIENT = '.kh/business/clients/acme-gmbh/client.yaml';
const withStage = (stage: string, extra: (m: Map<string, string>) => void = () => {}) => {
  const files = loadFixtureRepo();
  files.set(CLIENT, (files.get(CLIENT) ?? '').replace(/^stage: .*$/m, `stage: ${stage}`));
  extra(files);
  return loadBusinessRepo(files);
};
const offer = (repo: BusinessRepo): Issued => {
  const o = repo.issued.find((i) => i.doc.number === 'AN-2026-001')?.doc;
  if (!o) throw new Error('fixture');
  return o;
};
const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('decideOffer', () => {
  it('appends an accepted event and moves offer-sent to active, keeping other fields', () => {
    const repo = withStage('offer-sent');
    const v = ok(decideOffer(repo, '', 'AN-2026-001', 'accepted', now, id));
    expect(v.changes[EVENTS_PATH]).toBe(
      `{"id":"${id}","at":"2026-11-02T10:30:00.000Z","doc":"AN-2026-001","type":"accepted"}\n`,
    );
    const client = parseYaml(v.changes[CLIENT] ?? '');
    expect(client.ok && (client.value as { stage: string; name: string }).stage).toBe('active');
    expect(client.ok && (client.value as { name: string }).name).toBe('Acme GmbH');
    expect(v.message).toBe('business: accepted AN-2026-001');
  });

  it.each(['lead', 'contacted'])('moves %s to active', (stage) => {
    const v = ok(decideOffer(withStage(stage), '', 'AN-2026-001', 'accepted', now, id));
    expect(v.changes[CLIENT]).toContain('stage: active');
  });

  it.each(['past', 'active', 'lost'])('leaves stage %s unchanged', (stage) => {
    const v = ok(decideOffer(withStage(stage), '', 'AN-2026-001', 'accepted', now, id));
    expect(Object.keys(v.changes)).toEqual([EVENTS_PATH]);
  });

  it('declined appends only the event', () => {
    const v = ok(decideOffer(withStage('offer-sent'), null, 'AN-2026-001', 'declined', now, id));
    expect(Object.keys(v.changes)).toEqual([EVENTS_PATH]);
    expect(v.changes[EVENTS_PATH]).toContain('"type":"declined"');
  });

  it('keeps existing event lines byte for byte', () => {
    const text =
      '{"id":"01M5D6RA00AFMSY38DJQW16BGN","at":"2026-10-26T09:30:00Z","doc":"RE-2026-0001","type":"sent"}\n';
    const v = ok(decideOffer(withStage('lead'), text, 'AN-2026-001', 'declined', now, id));
    expect(v.changes[EVENTS_PATH]?.startsWith(text)).toBe(true);
  });

  it('refuses a second decision, even the opposite one', () => {
    const repo = withStage('offer-sent', (m) =>
      m.set(
        '.kh/business/events.jsonl',
        `{"id":"01M5D6RA00AFMSY38DJQW16BGN","at":"2026-10-30T09:30:00Z","doc":"AN-2026-001","type":"declined"}\n`,
      ),
    );
    expect(decideOffer(repo, null, 'AN-2026-001', 'accepted', now, id)).toMatchObject({
      ok: false,
      issues: [{ path: 'offer' }],
    });
  });

  it('refuses a superseded offer', () => {
    const repo = withStage('offer-sent');
    const o = offer(repo);
    const newer = { ...o, number: 'AN-2026-002', supersedes: o.number };
    const r = decideOffer(
      { ...repo, issued: [...repo.issued, { path: 'x', doc: newer }] },
      null,
      'AN-2026-001',
      'accepted',
      now,
      id,
    );
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'offer' }] });
  });

  it('refuses an unknown number and an invoice', () => {
    const repo = withStage('lead');
    expect(decideOffer(repo, null, 'AN-2026-099', 'accepted', now, id).ok).toBe(false);
    expect(decideOffer(repo, null, 'RE-2026-0001', 'accepted', now, id).ok).toBe(false);
  });
});

describe('offerToInvoiceDraft', () => {
  it('copies client, project, lines, currency and buyer reference, and validates', () => {
    const repo = withStage('active');
    const o = {
      ...offer(repo),
      project: 'website',
      currency: 'EUR',
      buyer_reference: 'PO-7',
    } as Issued;
    const d = offerToInvoiceDraft(o, draftId);
    expect(d).toMatchObject({
      id: draftId,
      kind: 'invoice',
      client: 'acme-gmbh',
      project: 'website',
      currency: 'EUR',
      buyer_reference: 'PO-7',
      from_offer: 'AN-2026-001',
      lines: o.lines,
    });
    expect(validateDraft(d).ok).toBe(true);
    expect(d).not.toHaveProperty('valid_until');
    expect(d).not.toHaveProperty('supersedes');
  });

  it('saves through saveDraft to drafts/<id>.yaml', () => {
    const repo = withStage('active');
    const d = offerToInvoiceDraft(offer(repo), draftId);
    const v = ok(saveDraft(repo, d));
    expect(Object.keys(v.changes)).toEqual([`.kh/business/drafts/${draftId}.yaml`]);
    expect(v.message).toBe(`business: save draft ${draftId} for acme-gmbh`);
    expect(v.changes[`.kh/business/drafts/${draftId}.yaml`]).toContain('from_offer: AN-2026-001');
  });
});

describe('saveDraft', () => {
  it('refuses an unknown client, an invalid draft and an already issued one', () => {
    const repo = withStage('active');
    const d = offerToInvoiceDraft(offer(repo), draftId);
    expect(saveDraft(repo, { ...d, client: 'nobody' as never }).ok).toBe(false);
    expect(saveDraft(repo, { ...d, lines: [] }).ok).toBe(false);
    const issuedId = offer(repo).draft_id;
    expect(saveDraft(repo, { ...d, id: issuedId })).toMatchObject({ ok: false });
  });

  it('replaces an existing draft', () => {
    const repo = withStage('active');
    const existing = repo.drafts[0];
    if (!existing) throw new Error('fixture');
    const v = ok(saveDraft(repo, { ...existing, notes: 'changed' }));
    expect(v.changes[`.kh/business/drafts/${existing.id}.yaml`]).toContain('notes: changed');
  });
});
