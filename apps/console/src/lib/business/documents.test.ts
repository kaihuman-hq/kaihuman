import { loadBusinessRepo, parseYaml, type Slug } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import {
  documentSummaries,
  newDocumentChanges,
  printFormOf,
  printFromForm,
  printSettingsChanges,
  sampleDocument,
} from './documents';
import { loadFixtureRepo } from './fixture.test-helper';

const DOC = '.kh/business/documents/offer-acme.md';
const files = () =>
  new Map([...loadFixtureRepo(), [DOC, sampleDocument('acme-gmbh' as Slug, '2026-11-18')]]);

describe('documents (console)', () => {
  it('summarises documents from their frontmatter', () => {
    const m = files();
    const repo = loadBusinessRepo(m);
    expect(documentSummaries(repo, Object.fromEntries(m))).toEqual([
      { slug: 'offer-acme', path: DOC, subject: 'Angebot', template: 'offer', client: 'acme-gmbh' },
    ]);
    expect(documentSummaries(repo, {})).toEqual([{ slug: 'offer-acme', path: DOC }]);
  });

  it('the sample names the first client and parses', () => {
    const text = sampleDocument(undefined, '2026-11-18');
    expect(text).toContain('number: AN-2026-0001');
    const fm = text.split('---')[1] ?? '';
    expect(parseYaml(fm).ok).toBe(true);
  });

  it('creates a new document once', () => {
    const repo = loadBusinessRepo(files());
    expect(newDocumentChanges(repo, 'offer-acme' as Slug, '2026-11-18').ok).toBe(false);
    const r = newDocumentChanges(repo, 'next' as Slug, '2026-11-18');
    expect(r.ok && Object.keys(r.value)).toEqual(['.kh/business/documents/next.md']);
  });

  it('checks the print form and writes only the print key', () => {
    const m = loadFixtureRepo();
    const profile = loadBusinessRepo(m).profile;
    if (!profile) throw new Error('fixture profile');
    const form = { ...printFormOf(profile), accent: 'blue' };
    const bad = printFromForm(profile, form);
    expect(!bad.ok && bad.issues.map((i) => i.path)).toEqual(['print.accent']);
    const good = printFromForm(profile, { ...form, accent: ' #0b6cf0 ', font: 'Inter' });
    expect(good).toEqual({ ok: true, value: { accent: '#0b6cf0', font: 'Inter' } });
    const text = m.get('.kh/business/business.yaml') ?? '';
    const changes = printSettingsChanges(text, good.ok ? good.value : {});
    expect(changes.ok).toBe(true);
    if (!changes.ok) return;
    const written = changes.value['.kh/business/business.yaml'] as string;
    expect(written.startsWith(text)).toBe(true);
    expect(written.slice(text.length)).toBe('print:\n  accent: "#0b6cf0"\n  font: Inter\n');
  });
});
