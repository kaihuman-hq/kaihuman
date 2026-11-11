import { buildDemoSeed } from '@kaihuman/core';
import { asSlug, type Slug, TIMER_PATH, type Ulid } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { addDays, isRealDate, weekStart } from './dates.js';
import {
  entryFromForm,
  fieldErrors,
  formatHours,
  parseHours,
  parseMoney,
  paymentFromForm,
} from './forms.js';
import { BUSINESS_PROFILE_PATH, businessRecordPaths, loadBusiness } from './load.js';
import {
  attentionItems,
  clientDetail,
  clientRows,
  hoursSummary,
  invoiceRows,
  receivables,
  timerMinutes,
} from './summary.js';
import { applyChanges, businessWriter, NOT_ENABLED } from './write.js';

const NOW = new Date(2026, 10, 11, 10, 0, 0);
const TODAY = '2026-11-11';
const NW = 'northwind-labs' as Slug;

function memoryFiles(initial: Record<string, string>) {
  const contents = { ...initial };
  const ops: string[] = [];
  const files = {
    tree: () => Object.keys(contents).map((path) => ({ path, type: 'blob', sha: '', url: '' })),
    read: async (path: string) => {
      const c = contents[path];
      if (c === undefined) throw new Error(`missing ${path}`);
      return c;
    },
    write: async (path: string, content: string) => {
      ops.push(`write ${path}`);
      contents[path] = content;
    },
    create: async (path: string, content: string) => {
      if (path in contents) throw new Error('exists');
      ops.push(`create ${path}`);
      contents[path] = content;
    },
    remove: async (path: string) => {
      ops.push(`remove ${path}`);
      delete contents[path];
    },
  } as unknown as ContentFiles;
  return { files, contents, ops };
}

const seed = () => memoryFiles(buildDemoSeed(NOW).files);
const ids = () => {
  let n = 0;
  return () => `01JC0000000000000000000${(n++).toString().padStart(3, '0')}`.slice(-26) as Ulid;
};

describe('business dates and forms', () => {
  it('computes week starts and real dates', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isRealDate('2026-02-31')).toBe(false);
  });

  it('parses durations and money like the console', () => {
    expect(parseHours('1.5')).toBe(90);
    expect(parseHours('1,5')).toBe(90);
    expect(parseHours('1:30')).toBe(90);
    expect(parseHours('90m')).toBe(90);
    expect(parseHours('soon')).toBeNull();
    expect(formatHours(95)).toBe('1:35');
    expect(parseMoney('1.200,50')).toBe(120050);
    expect(parseMoney('1,200.50')).toBe(120050);
    expect(parseMoney('500')).toBe(50000);
    expect(parseMoney('12,345')).toBeNull();
  });

  it('validates the time form with per-field errors', () => {
    const bad = entryFromForm({
      client: '',
      project: '',
      date: '2026-13-01',
      hours: 'x',
      note: '',
    });
    expect(Object.keys(fieldErrors(bad)).sort()).toEqual(['client', 'date', 'hours', 'note']);
    const good = entryFromForm({ client: NW, project: '', date: TODAY, hours: '2', note: 'Call' });
    expect(good).toEqual({
      ok: true,
      value: { client: NW, date: TODAY, minutes: 120, note: 'Call' },
    });
  });

  it('defaults an empty payment amount to what is open', () => {
    const r = paymentFromForm({ amount: '', date: TODAY, method: ' bank ', ref: '' }, 4200);
    expect(r).toEqual({ ok: true, value: { amount: 4200, date: TODAY, method: 'bank' } });
    expect(
      fieldErrors(paymentFromForm({ amount: '0', date: TODAY, method: '', ref: '' }, 1)),
    ).toEqual({
      amount: 'The amount must be more than 0.',
    });
  });
});

describe('loadBusiness', () => {
  it('is disabled without a business profile', async () => {
    expect(await loadBusiness(memoryFiles({ 'a.md': 'x' }).files)).toEqual({ status: 'disabled' });
  });

  it('loads the demo business and skips artifacts', async () => {
    const { files } = seed();
    expect(businessRecordPaths(files.tree())).toContain(BUSINESS_PROFILE_PATH);
    const state = await loadBusiness(files);
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.repo.clients.map((c) => c.slug)).toContain(NW);
    expect(state.failed).toEqual([]);
  });

  it('lists files that could not be read instead of failing', async () => {
    const { files, contents } = seed();
    const broken = {
      ...files,
      read: async (p: string) => {
        if (p.endsWith('client.yaml')) throw new Error('offline');
        return contents[p] as string;
      },
    };
    const state = await loadBusiness(broken);
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.failed.length).toBeGreaterThan(0);
    expect(state.repo.clients).toEqual([]);
  });
});

describe('business summary', () => {
  it('derives invoices, receivables, clients, hours and attention from the demo', async () => {
    const state = await loadBusiness(seed().files);
    if (state.status !== 'ready') throw new Error('not ready');
    const { repo } = state;
    const rows = invoiceRows(repo, TODAY);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of receivables(rows)) expect(r.status.open).toBeGreaterThan(0);
    const clients = clientRows(repo, TODAY);
    expect(clients[0]?.stage).toBe('active');
    const hours = hoursSummary(repo.time, TODAY);
    expect(hours.month).toBeGreaterThanOrEqual(hours.week);
    expect(hours.week).toBeGreaterThanOrEqual(hours.today);
    const keys = attentionItems(repo, TODAY).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const detail = clientDetail(repo, NW, TODAY);
    expect(detail?.client.slug).toBe(NW);
    expect(detail?.files.map((f) => f.kind).sort()).toEqual(
      expect.arrayContaining(['log', 'todos']),
    );
    expect(clientDetail(repo, 'nobody', TODAY)).toBeNull();
  });

  it('flags an overdue invoice first', async () => {
    const state = await loadBusiness(seed().files);
    if (state.status !== 'ready') throw new Error('not ready');
    const later = addDays(TODAY, 400);
    const open = receivables(invoiceRows(state.repo, later));
    if (open.length === 0) return;
    expect(open[0]?.status.state).toBe('overdue');
    expect(attentionItems(state.repo, later)[0]?.target.kind).toBe('invoice');
  });

  it('counts timer minutes from the start', () => {
    expect(timerMinutes(new Date(NOW.getTime() - 125 * 60000).toISOString(), NOW)).toBe(125);
    expect(timerMinutes(new Date(NOW.getTime() + 60000).toISOString(), NOW)).toBe(0);
  });
});

describe('business writes', () => {
  it('applies additions before deletions, creating new files', async () => {
    const { files, ops } = memoryFiles({ 'a.txt': '1', 'b.txt': '2' });
    await applyChanges(files, { 'b.txt': null, 'a.txt': '3', 'c.txt': '4', 'gone.txt': null });
    expect(ops).toEqual(['write a.txt', 'create c.txt', 'remove b.txt']);
  });

  it('refuses when business is not set up', async () => {
    const w = businessWriter(memoryFiles({}).files);
    expect(await w.cancelTimer()).toEqual({ ok: false, message: NOT_ENABLED });
  });

  it('starts a timer, then stops it into a time entry', async () => {
    const { files, contents } = seed();
    delete contents[TIMER_PATH];
    const w = businessWriter(files, { now: () => NOW, id: ids() });
    const started = await w.startTimer({ client: NW, note: 'Design' });
    expect(started.ok).toBe(true);
    expect(contents[TIMER_PATH]).toContain('northwind-labs');
    expect((await w.startTimer({ client: NW })).ok).toBe(false);
    const logged = await w.logTime(
      { date: TODAY, minutes: 45, client: NW, note: 'Design' },
      { stopTimer: true },
    );
    expect(logged).toEqual({ ok: true, message: 'business: log 0.8 h for northwind-labs' });
    expect(contents[TIMER_PATH]).toBeUndefined();
    expect(contents['.kh/business/time/2026-11.jsonl']).toContain('"minutes":45');
  });

  it('refuses time for an unknown client', async () => {
    const w = businessWriter(seed().files, { id: ids() });
    const r = await w.logTime({
      date: TODAY,
      minutes: 5,
      client: asSlug('ghost') as Slug,
      note: 'x',
    });
    expect(r.ok).toBe(false);
  });

  it('adds a client todo and log line', async () => {
    const { files, contents } = seed();
    const w = businessWriter(files, { now: () => NOW });
    expect((await w.addClientLine('todo', NW, 'Send the brief')).ok).toBe(true);
    expect(contents[`.kh/business/clients/${NW}/todos.todos.md`]).toContain('Send the brief');
    expect((await w.addClientLine('log', NW, 'Kick-off call')).ok).toBe(true);
    expect(contents[`.kh/business/clients/${NW}/log.actionlog.md`]).toContain('Kick-off call');
    expect((await w.addClientLine('log', NW, '  ')).ok).toBe(false);
  });

  it('records a payment against an open invoice', async () => {
    const { files, contents } = seed();
    const state = await loadBusiness(files);
    if (state.status !== 'ready') throw new Error('not ready');
    const open = receivables(invoiceRows(state.repo, TODAY))[0];
    if (!open) throw new Error('demo has no open invoice');
    const w = businessWriter(files, { id: ids() });
    const r = await w.recordPayment({
      invoice: open.number,
      amount: open.status.open,
      date: TODAY,
    });
    expect(r.ok).toBe(true);
    expect(contents['.kh/business/payments/2026.jsonl']).toContain(open.number);
    const after = await loadBusiness(files);
    if (after.status !== 'ready') throw new Error('not ready');
    const row = invoiceRows(after.repo, TODAY).find((x) => x.number === open.number);
    expect(row?.status.state).toBe('paid');
    expect((await w.recordPayment({ invoice: 'NOPE', amount: 1, date: TODAY })).ok).toBe(false);
  });
});
