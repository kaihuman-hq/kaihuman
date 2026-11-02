import { describe, expect, it } from 'vitest';
import { asSlug, type Ulid } from './ids.js';
import {
  BUSINESS_ROOT,
  classifyBusinessPath,
  clientDir,
  draftPath,
  issuedPath,
  LINKS_PATH,
  paymentsPath,
  timePath,
} from './paths.js';

const id = '01M50ARQ007CHPV05AFMSY38DJ' as Ulid;
const b = (p: string) => classifyBusinessPath(`${BUSINESS_ROOT}/${p}`);

describe('classifyBusinessPath', () => {
  it('classifies LINKS_PATH as the links file', () => {
    expect(classifyBusinessPath(LINKS_PATH)).toEqual({ kind: 'links' });
  });

  it('classifies issued documents and their artifacts', () => {
    expect(b('invoices/2026/RE-2026-0001.yaml')).toEqual({
      kind: 'issued',
      doc: 'invoice',
      year: 2026,
      number: 'RE-2026-0001',
    });
    expect(b('offers/2026/AN-2026-001.yaml')).toEqual({
      kind: 'issued',
      doc: 'offer',
      year: 2026,
      number: 'AN-2026-001',
    });
    expect(b('invoices/2026/RE-2026-0001.pdf')).toEqual({
      kind: 'artifact',
      doc: 'invoice',
      ext: 'pdf',
    });
    expect(b('invoices/2026/RE-2026-0001.xml')).toEqual({
      kind: 'artifact',
      doc: 'invoice',
      ext: 'xml',
    });
    expect(b('offers/2026/AN-2026-001.sha256')).toEqual({
      kind: 'artifact',
      doc: 'offer',
      ext: 'sha256',
    });
    expect(b(`clients/acme-gmbh/contracts/${id}.pdf`)).toEqual({
      kind: 'artifact',
      doc: 'contract',
      ext: 'pdf',
    });
    expect(b('invoices/2026/RE-2026-0001.docx').kind).toBe('unknown');
    expect(b('invoices/26/RE-2026-0001.yaml').kind).toBe('unknown');
  });

  it('classifies client files', () => {
    expect(b('clients/acme-gmbh/client.yaml')).toEqual({ kind: 'client', client: 'acme-gmbh' });
    expect(b('clients/acme-gmbh/projects/website.yaml')).toEqual({
      kind: 'project',
      client: 'acme-gmbh',
      project: 'website',
    });
    expect(b(`clients/acme-gmbh/contracts/${id}.yaml`)).toEqual({
      kind: 'contract',
      client: 'acme-gmbh',
      id,
    });
    expect(b('clients/acme-gmbh/todos.todos.md')).toEqual({ kind: 'todos', client: 'acme-gmbh' });
    expect(b('clients/acme-gmbh/log.actionlog.md')).toEqual({ kind: 'log', client: 'acme-gmbh' });
    expect(b('clients/acme-gmbh/notes.md')).toEqual({ kind: 'notes', client: 'acme-gmbh' });
    expect(b('clients/Acme/client.yaml').kind).toBe('unknown');
    expect(b('clients/acme-gmbh/other.txt').kind).toBe('unknown');
    expect(b('clients/acme-gmbh/contracts/not-a-ulid.yaml').kind).toBe('unknown');
  });

  it('classifies top-level records and streams', () => {
    expect(b('business.yaml')).toEqual({ kind: 'profile' });
    expect(b(`drafts/${id}.yaml`)).toEqual({ kind: 'draft', id });
    expect(b('time/2026-10.jsonl')).toEqual({ kind: 'time', month: '2026-10' });
    expect(b('time/2026-13.jsonl').kind).toBe('unknown');
    expect(b('time/running.yaml')).toEqual({ kind: 'timer' });
    expect(b('payments/2026.jsonl')).toEqual({ kind: 'payments', year: 2026 });
    expect(b('events.jsonl')).toEqual({ kind: 'events' });
    expect(b('links.jsonl')).toEqual({ kind: 'links' });
    expect(b(`expenses/2026/${id}.yaml`)).toEqual({ kind: 'expense', year: 2026, id });
    expect(b(`expenses/2026/${id}.pdf`)).toEqual({ kind: 'receipt' });
  });

  it('classifies scaffold files as meta', () => {
    for (const p of ['SKILL.md', 'VERFAHRENSDOKUMENTATION.md', '.gitkeep', '.tools/check.mjs']) {
      expect(b(p)).toEqual({ kind: 'meta' });
    }
  });

  it('classifies the scaffold .gitkeep files in data folders as meta, not elsewhere', () => {
    for (const dir of ['clients', 'drafts', 'offers', 'invoices', 'time', 'payments', 'expenses']) {
      expect(b(`${dir}/.gitkeep`)).toEqual({ kind: 'meta' });
    }
    expect(b('other/.gitkeep').kind).toBe('unknown');
    expect(b('invoices/2026/.gitkeep').kind).toBe('unknown');
  });

  it('treats paths outside the business root as unknown', () => {
    expect(classifyBusinessPath('notes/business.yaml').kind).toBe('unknown');
    expect(classifyBusinessPath('.kh/businessx/business.yaml').kind).toBe('unknown');
  });
});

describe('path builders', () => {
  it('round-trip through classifyBusinessPath', () => {
    expect(classifyBusinessPath(issuedPath('invoice', 2026, 'RE-2026-0001'))).toMatchObject({
      kind: 'issued',
      number: 'RE-2026-0001',
    });
    expect(classifyBusinessPath(draftPath(id))).toEqual({ kind: 'draft', id });
    expect(classifyBusinessPath(timePath('2026-10'))).toEqual({ kind: 'time', month: '2026-10' });
    expect(classifyBusinessPath(paymentsPath(2026))).toEqual({ kind: 'payments', year: 2026 });
    const slug = asSlug('acme-gmbh');
    if (!slug) throw new Error('slug');
    expect(clientDir(slug)).toBe('.kh/business/clients/acme-gmbh');
  });
});
