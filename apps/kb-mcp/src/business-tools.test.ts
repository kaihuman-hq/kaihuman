import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { GitSync } from './git.js';
import { KnowledgeBase } from './repo.js';
import { createKbServer } from './server.js';
import { git, makeBusinessRepo, makeGitRepo, makeRepo } from './test/fixture.js';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

const FIXTURE = '../../../packages/formats/fixtures/business/repo';
const INVOICE = '.kh/business/invoices/2026/RE-2026-0002.yaml';

/** A second, unpaid invoice (due 2026-11-01) copied from the fixture's issued one. */
async function unpaidInvoice(): Promise<Record<string, string>> {
  const text = await readFile(
    new URL(`${FIXTURE}/invoices/2026/RE-2026-0001.yaml`, import.meta.url),
    'utf8',
  );
  return {
    [INVOICE]: text
      .replace('RE-2026-0001', 'RE-2026-0002')
      .replace('2026-11-09', '2026-11-01')
      .replace('01M50ARQ007CHPV05AFMSY38DJ', '01M50ARQ007CHPV05AFMSY38DK'),
  };
}

async function connectTo(root: string, git?: GitSync) {
  const server = createKbServer(await KnowledgeBase.open(root), git ? { git } : {});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await (client as Client).callTool({ name, arguments: args })) as CallToolResult;
  return { root, call };
}

const connect = async (extra: Record<string, string> = {}) =>
  connectTo(await makeBusinessRepo(extra));

const text = (r: CallToolResult): string => {
  const first = r.content[0];
  if (first?.type !== 'text') throw new Error('expected text');
  return first.text;
};
const parse = (r: CallToolResult): any => JSON.parse(text(r));

const LINE = {
  description: 'Consulting',
  quantity: '2',
  unit: 'HUR',
  unit_price: 10000,
  vat_category: 'S',
  vat_rate: '19',
};

describe('business read tools', () => {
  it('refuses without business data', async () => {
    const { call } = await connectTo(await makeRepo({}));
    const result = await call('business_clients');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No business data');
  });

  it('business_clients summarises clients', async () => {
    const { call } = await connect(await unpaidInvoice());
    const rows = parse(await call('business_clients'));
    // The time entry is billed, so nothing is unbilled; RE-2026-0002 is open (and overdue).
    expect(rows).toEqual([
      {
        slug: 'acme-gmbh',
        name: 'Acme GmbH',
        stage: 'active',
        tags: ['web'],
        currency: 'EUR',
        open: 100138,
        overdue: 1,
        unbilledMinutes: 0,
      },
    ]);
    expect(parse(await call('business_clients', { stage: 'lead' }))).toEqual([]);
  });

  it('business_client returns statuses, time, drafts and files', async () => {
    const { call } = await connect();
    const c = parse(await call('business_client', { client: 'acme-gmbh', today: '2026-11-03' }));
    expect(c.client.name).toBe('Acme GmbH');
    expect(c.invoices).toMatchObject([
      {
        number: 'RE-2026-0001',
        kind: 'invoice',
        gross: 100138,
        status: { state: 'paid', open: 0 },
      },
    ]);
    expect(c.offers).toMatchObject([{ number: 'AN-2026-001', gross: 595000, status: 'expired' }]);
    expect(c.drafts).toHaveLength(1);
    expect(c.drafts[0].lines).toHaveLength(3);
    expect(c.payments).toHaveLength(1);
    expect(c.time).toEqual({ unbilled: [], minutesByMonth: { '2026-10': 450 } });
    expect(c.contracts[0].id).toBe('01M52X5E00EKRX27CHPV05AFMS');
    expect(c.files).toEqual({});
    const asOf = parse(await call('business_client', { client: 'acme-gmbh', today: '2026-09-20' }));
    expect(asOf.offers[0].status).toBe('issued');
  });

  it('business_client rejects an unknown client', async () => {
    const { call } = await connect();
    const result = await call('business_client', { client: 'nobody' });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Unknown client nobody. Use business_clients.');
  });

  it('business_open_invoices lists open ones, overdue first', async () => {
    const { call } = await connect(await unpaidInvoice());
    const r = parse(await call('business_open_invoices', { today: '2026-11-03' }));
    expect(r.invoices).toEqual([
      expect.objectContaining({ number: 'RE-2026-0002', open: 100138, state: 'overdue' }),
    ]);
    expect(r.totals).toEqual({ open: 100138, overdue: 100138 });
    const early = parse(await call('business_open_invoices', { today: '2026-10-30' }));
    expect(early.totals).toEqual({ open: 100138, overdue: 0 });
    const none = parse(await call('business_open_invoices', { client: 'acme-gmbh' }));
    expect(none.invoices).toHaveLength(1);
  });

  it('business_vat_summary computes a period and rejects a bad one', async () => {
    const { call } = await connect();
    const r = parse(await call('business_vat_summary', { period: '2026-Q4' }));
    expect(r).toMatchObject({ applicable: true, period: '2026-Q4' });
    expect(r.outputTax).toBeGreaterThan(0);
    expect((await call('business_vat_summary', { period: '2026-13' })).isError).toBe(true);
  });

  it('business_reminders lists contract dates in the window', async () => {
    const { call } = await connect();
    const r = parse(await call('business_reminders', { today: '2026-11-03' }));
    expect(r.retainers).toEqual([]);
    expect(r.contracts).toEqual([]);
  });

  it('business_check reports findings and the frozen-rule note', async () => {
    const { call } = await connect();
    const r = parse(await call('business_check'));
    expect(r.errors).toBe(0);
    expect(r.note).toContain('frozen-file');
    const empty = parse(await (await connectTo(await makeRepo({}))).call('business_check'));
    expect(empty.findings.join('\n')).toContain('business.yaml is missing');
  });
});

describe('business write tools', () => {
  const draftFiles = async (root: string) =>
    (await readdir(join(root, '.kh/business/drafts'))).sort();

  it('business_create_draft saves a draft and reports path and id', async () => {
    const { root, call } = await connect();
    const r = parse(
      await call('business_create_draft', { kind: 'invoice', client: 'acme-gmbh', lines: [LINE] }),
    );
    expect(r.paths).toEqual([`.kh/business/drafts/${r.id}.yaml`]);
    expect(r.git).toContain('git sync is off');
    expect(await readFile(join(root, r.paths[0]), 'utf8')).toContain('Consulting');
    expect(await draftFiles(root)).toContain(`${r.id}.yaml`);
  });

  it('business_create_draft refuses invalid input with path: message', async () => {
    const { root, call } = await connect();
    const before = await draftFiles(root);
    const unknown = await call('business_create_draft', {
      kind: 'invoice',
      client: 'nobody',
      lines: [LINE],
    });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toContain('client: unknown client "nobody"');
    const bad = await call('business_create_draft', {
      kind: 'invoice',
      client: 'acme-gmbh',
      lines: [{ ...LINE, quantity: 'lots' }],
    });
    expect(bad.isError).toBe(true);
    expect(await draftFiles(root)).toEqual(before);
  });

  it('business_update_draft replaces an existing draft', async () => {
    const { root, call } = await connect();
    const id = '01M5KA3Q00W16BGNTZ49EKRX27';
    const r = parse(
      await call('business_update_draft', {
        id,
        kind: 'invoice',
        client: 'acme-gmbh',
        lines: [LINE],
        notes: 'Updated',
      }),
    );
    expect(r.id).toBe(id);
    const saved = await readFile(join(root, `.kh/business/drafts/${id}.yaml`), 'utf8');
    expect(saved).toContain('notes: Updated');
    expect(saved).not.toContain('Setup');
  });

  it('business_update_draft refuses a missing draft and an issued one', async () => {
    const { call } = await connect();
    const args = { kind: 'invoice', client: 'acme-gmbh', lines: [LINE] };
    const missing = await call('business_update_draft', {
      id: '01M5KA3Q00W16BGNTZ49EKRX99',
      ...args,
    });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain('No draft');
    const notUlid = await call('business_update_draft', { id: 'RE-2026-0001', ...args });
    expect(notUlid.isError).toBe(true);
    // The draft behind the issued invoice no longer exists as a file, so it is "missing" too.
    const issued = await call('business_update_draft', {
      id: '01M50ARQ007CHPV05AFMSY38DJ',
      ...args,
    });
    expect(issued.isError).toBe(true);
  });

  it('business_add_time appends to the month file', async () => {
    const { root, call } = await connect();
    const r = parse(
      await call('business_add_time', {
        client: 'acme-gmbh',
        project: 'website',
        date: '2026-10-20',
        minutes: 90,
        note: 'Review',
      }),
    );
    expect(r.paths).toEqual(['.kh/business/time/2026-10.jsonl']);
    const lines = (await readFile(join(root, r.paths[0]), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] as string)).toMatchObject({ id: r.id, minutes: 90, note: 'Review' });
    const bad = await call('business_add_time', { client: 'acme-gmbh', minutes: 0, note: 'x' });
    expect(bad.isError).toBe(true);
    const unknown = await call('business_add_time', { client: 'nobody', minutes: 5, note: 'x' });
    expect(text(unknown)).toContain('unknown client');
  });

  it('business_add_todo and business_add_log write the client files', async () => {
    const { root, call } = await connect();
    const todo = parse(
      await call('business_add_todo', { client: 'acme-gmbh', text: 'Send offer #sales' }),
    );
    expect(todo.paths).toEqual(['.kh/business/clients/acme-gmbh/todos.todos.md']);
    await call('business_add_todo', { client: 'acme-gmbh', text: 'Second' });
    const todos = await readFile(join(root, todo.paths[0]), 'utf8');
    expect(todos).toContain('Send offer');
    expect(todos).toContain('Second');
    const log = parse(
      await call('business_add_log', { client: 'acme-gmbh', text: 'Called Erika' }),
    );
    expect(await readFile(join(root, log.paths[0]), 'utf8')).toContain('Called Erika');
    const c = parse(await call('business_client', { client: 'acme-gmbh' }));
    expect(Object.keys(c.files).sort()).toEqual(['log', 'todos']);
    expect((await call('business_add_log', { client: 'nobody', text: 'x' })).isError).toBe(true);
  });

  it('business_add_expense creates a new expense', async () => {
    const { root, call } = await connect();
    const r = parse(
      await call('business_add_expense', {
        date: '2026-10-30',
        supplier: 'Hetzner',
        description: 'Server',
        category: 'hosting',
        net: 1000,
        vat: 190,
        gross: 1190,
        vat_rate: '19',
        client: 'acme-gmbh',
      }),
    );
    expect(r.paths).toEqual([`.kh/business/expenses/2026/${r.id}.yaml`]);
    expect(await readFile(join(root, r.paths[0]), 'utf8')).toContain('Hetzner');
    const bad = await call('business_add_expense', {
      date: '2026-10-30',
      supplier: 'X',
      description: 'y',
      category: 'z',
      net: 1000,
      vat: 190,
      gross: 5,
      vat_rate: '19',
    });
    expect(bad.isError).toBe(true);
  });

  it('never touches issued documents or links, and has no delete or issue tool', async () => {
    const { root, call } = await connect();
    const before = await readFile(join(root, '.kh/business/links.jsonl'), 'utf8');
    await call('business_create_draft', { kind: 'offer', client: 'acme-gmbh', lines: [LINE] });
    expect(await readFile(join(root, '.kh/business/links.jsonl'), 'utf8')).toBe(before);
    expect(existsSync(join(root, '.kh/business/invoices/2026/RE-2026-0001.yaml'))).toBe(true);
    const names = (await (client as Client).listTools()).tools.map((t) => t.name);
    expect(names.filter((n) => /issue|delete|payment|link/.test(n))).toEqual([]);
  });

  it('commits only the written path when git sync is on', async () => {
    const business = await makeBusinessRepo();
    const files = Object.fromEntries(
      await Promise.all(
        (await readdir(join(business, '.kh/business'), { recursive: true }))
          .filter((p) => /\.(yaml|jsonl)$/.test(p))
          .map(async (p) => [
            `.kh/business/${p}`,
            await readFile(join(business, '.kh/business', p), 'utf8'),
          ]),
      ),
    );
    const repo = await makeGitRepo(files);
    // Another change sits staged but must stay out of the commit.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(repo.root, 'unrelated.txt'), 'x');
    await git(repo.root, 'add', 'unrelated.txt');
    const { call } = await connectTo(repo.root, new GitSync(repo.root));
    const r = parse(await call('business_add_log', { client: 'acme-gmbh', text: 'Called Erika' }));
    expect(r.git).toBe('Committed and pushed.');
    expect(await git(repo.root, 'log', '-1', '--format=%s')).toBe('business: log for acme-gmbh');
    expect(await git(repo.root, 'show', '--name-only', '--format=', 'HEAD')).toBe(
      '.kh/business/clients/acme-gmbh/log.actionlog.md',
    );
    expect(await git(repo.root, 'status', '--short')).toBe('A  unrelated.txt');
  });
});
