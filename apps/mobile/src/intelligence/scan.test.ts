import { describe, expect, it } from 'vitest';
import {
  describeScanEntry,
  MAX_SCAN_CHARS,
  plainScanEntry,
  saveScanEntry,
  scanInstructions,
  scanTextToEntry,
  toScanEntry,
} from './scan.js';
import { controllerFor, fakeModel, memFiles } from './test-helpers.js';

const now = new Date(2026, 10, 10, 9, 0);

describe('toScanEntry', () => {
  it('validates each kind', () => {
    expect(
      toScanEntry(
        { kind: 'budget', title: 'Migros', amount: 42.155, category: 'food', date: '2026-11-08' },
        now,
      ),
    ).toEqual({
      kind: 'budget',
      name: 'Migros',
      amount: 42.16,
      category: 'food',
      date: '2026-11-08',
    });
    expect(
      toScanEntry(
        {
          kind: 'travel',
          title: 'ZRH → LIS',
          date: '2026-12-01',
          endDate: '2026-11-01',
          place: 'Lisbon',
        },
        now,
      ),
    ).toEqual({
      kind: 'travel',
      title: 'ZRH → LIS',
      start: '2026-12-01',
      destination: 'Lisbon',
    });
    expect(toScanEntry({ kind: 'todo', title: 'Renew passport', date: '2026-12-01' }, now)).toEqual(
      { kind: 'todo', text: 'Renew passport', due: { date: '2026-12-01' } },
    );
    expect(toScanEntry({ kind: 'consumption', title: 'Power', reading: 1234.5 }, now)).toEqual({
      kind: 'consumption',
      meter: 'Power',
      reading: 1234.5,
      date: '2026-11-10',
    });
  });

  it('rejects unusable results', () => {
    for (const raw of [
      null,
      { kind: 'budget', title: 'x' },
      { kind: 'consumption', title: 'Gas' },
      { kind: 'todo', title: '' },
      { kind: 'x', title: 'a' },
    ]) {
      expect(toScanEntry(raw, now)).toBeNull();
    }
  });
});

describe('scanTextToEntry', () => {
  it('uses the on-device model with the user-picked kind and a capped prompt', async () => {
    const model = fakeModel({
      device: true,
      json: { kind: 'budget', title: 'Migros', amount: 12 },
    });
    const res = await scanTextToEntry('x'.repeat(MAX_SCAN_CHARS + 50), {
      model,
      now,
      prefer: 'budget',
    });
    expect(res.source).toBe('model');
    expect(model.calls[0]?.prompt).toHaveLength(MAX_SCAN_CHARS);
    expect(model.calls[0]?.target).toBe('device');
    expect(scanInstructions(now, 'budget')).toContain('asked for a budget entry');
  });

  it('falls back to the first line as a todo', async () => {
    expect(await scanTextToEntry('\n  \nMigros Zürich\nTotal 12.00', { model: null, now })).toEqual(
      { source: 'plain', entry: { kind: 'todo', text: 'Migros Zürich' } },
    );
    expect(
      await scanTextToEntry('a', { model: fakeModel({ device: true, json: {} }), now }),
    ).toEqual({ source: 'plain', entry: null });
    expect(plainScanEntry('')).toBeNull();
  });
});

describe('saveScanEntry', () => {
  it('writes trips and meter readings into existing files', async () => {
    const files = memFiles({
      'travel/trips.travel.json': JSON.stringify({ version: 1, currency: 'CHF', trips: [] }),
      'home/meters.consumption.csv': 'created,Power[unit:kWh]\n2026-10-01,1000\n',
    });
    const deps = { controller: controllerFor(files, now), files, newId: () => 'trip-1' };
    expect(
      await saveScanEntry(
        { kind: 'travel', title: 'Lisbon', start: '2026-12-01', end: '2026-12-05' },
        deps,
      ),
    ).toMatchObject({ ok: true, message: 'Trip added' });
    expect(files.data['travel/trips.travel.json']).toContain('"Lisbon"');
    expect(
      await saveScanEntry(
        { kind: 'consumption', meter: 'power', reading: 1100, date: '2026-11-10' },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(files.data['home/meters.consumption.csv']).toMatch(/2026-11-10.*,1100/);
  });

  it('falls back to a todo or log when the module file is missing', async () => {
    const files = memFiles();
    const deps = { controller: controllerFor(files, now), files };
    await saveScanEntry({ kind: 'travel', title: 'Lisbon', start: '2026-12-01' }, deps);
    await saveScanEntry(
      { kind: 'consumption', meter: 'Gas', reading: 5, date: '2026-11-10' },
      deps,
    );
    await saveScanEntry(
      { kind: 'todo', text: 'Renew passport', due: { date: '2026-12-01' } },
      deps,
    );
    expect(files.data['.kh/inbox.todos.md']).toContain('Plan trip: Lisbon (2026-12-01) #travel');
    expect(files.data['.kh/inbox.todos.md']).toContain('Renew passport');
    expect(files.data['.kh/inbox.actionlog.md']).toContain('Gas reading 5');
  });
});

describe('describeScanEntry', () => {
  it('summarises each kind', () => {
    expect(
      describeScanEntry({
        kind: 'budget',
        name: 'Migros',
        amount: 4.5,
        category: 'food',
        date: '2026-11-08',
      }),
    ).toBe('Budget · Migros · 4.5 · food · 2026-11-08');
    expect(
      describeScanEntry({
        kind: 'travel',
        title: 'Lisbon',
        start: '2026-12-01',
        end: '2026-12-05',
      }),
    ).toBe('Travel · Lisbon · 2026-12-01 – 2026-12-05');
    expect(describeScanEntry({ kind: 'todo', text: 'Call' })).toBe('Todo · Call');
    expect(
      describeScanEntry({ kind: 'consumption', meter: 'Gas', reading: 5, date: '2026-11-10' }),
    ).toBe('Meter · Gas · 5 · 2026-11-10');
  });
});
