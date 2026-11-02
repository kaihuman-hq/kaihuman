import { describe, expect, it } from 'vitest';
import { localDate } from '../../dates.js';
import { checkBusinessRepo } from '../check.js';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug, Ulid } from '../ids.js';
import { classifyBusinessPath, TIMER_PATH } from '../paths.js';
import type { RunningTimer, TimeEntry } from '../records.js';
import { loadBusinessRepo } from '../repo.js';
import { cancelTimer, logTime, startTimer, timerToEntry } from './time.js';

const ulid0 = '01M581YW00W16BGNTZ49EKRX28' as Ulid;
const files = loadFixtureRepo();
const repo = loadBusinessRepo(files);
const now = new Date('2026-11-02T09:30:00+01:00');
const t = { client: 'acme-gmbh', started_at: '2026-11-02T23:30:00+01:00' } as RunningTimer;
const MONTH = '.kh/business/time/2026-11.jsonl';

describe('timerToEntry', () => {
  it('dates a timer running past midnight on its start day', () => {
    const e = timerToEntry(t, new Date('2026-11-03T01:00:00+01:00'));
    // The runtime's local day, as the production code uses; TZ may be anything on CI.
    expect(e).toMatchObject({ date: localDate(new Date(t.started_at)), minutes: 90 });
  });

  it('clamps a timer left running for days to 1440 and a tiny one to 1', () => {
    expect(timerToEntry(t, new Date('2026-11-05T09:00:00+01:00')).minutes).toBe(1440);
    expect(timerToEntry(t, new Date('2026-11-02T23:30:10+01:00')).minutes).toBe(1);
    expect(timerToEntry(t, new Date('2026-11-02T23:00:00+01:00')).minutes).toBe(1);
  });

  it('carries project and note, with an empty note for the form to fill', () => {
    expect(
      timerToEntry({ ...t, project: 'website', note: 'x' } as RunningTimer, now),
    ).toMatchObject({
      project: 'website',
      note: 'x',
    });
    expect(timerToEntry(t, now).note).toBe('');
  });
});

describe('startTimer', () => {
  it('writes running.yaml and a message', () => {
    const r = startTimer(repo, { client: 'acme-gmbh', project: 'website', note: ' Docs ' }, now);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.message).toBe('business: start timer for acme-gmbh');
    expect(r.value.changes[TIMER_PATH]).toBe(
      `client: acme-gmbh\nproject: website\nstarted_at: ${now.toISOString()}\nnote: Docs\n`,
    );
  });

  it('refuses while a timer runs', () => {
    expect(startTimer({ ...repo, timer: t }, { client: 'acme-gmbh' }, now)).toMatchObject({
      ok: false,
      issues: [{ path: 'timer', message: 'A timer is already running for acme-gmbh.' }],
    });
  });

  it('refuses an unknown client or project', () => {
    expect(startTimer(repo, { client: 'nobody' }, now)).toMatchObject({
      ok: false,
      issues: [{ path: 'client' }],
    });
    expect(startTimer(repo, { client: 'acme-gmbh', project: 'nope' }, now)).toMatchObject({
      ok: false,
      issues: [{ path: 'project' }],
    });
  });
});

describe('logTime', () => {
  const entry: Omit<TimeEntry, 'id'> = {
    date: '2026-11-02',
    minutes: 90,
    client: 'acme-gmbh' as Slug,
    note: 'x',
  };
  const existing =
    '{"id":"01M581YW00W16BGNTZ49EKRX27","date":"2026-11-01","minutes":60,"client":"acme-gmbh","note":"y"}';

  it('appends to the month file, keeps the old text and stops the timer', () => {
    const r = logTime({ ...repo, timer: t }, { [MONTH]: `${existing}\n` }, entry, {
      id: ulid0,
      stopTimer: true,
    });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.changes[TIMER_PATH]).toBeNull();
    expect(r.value.changes[MONTH]?.startsWith(`${existing}\n`)).toBe(true);
    expect(
      r.value.changes[MONTH]?.endsWith(
        `{"id":"${ulid0}","date":"2026-11-02","minutes":90,"client":"acme-gmbh","note":"x"}\n`,
      ),
    ).toBe(true);
    expect(r.value.message).toBe('business: log 1.5 h for acme-gmbh');
  });

  it('creates the month file and leaves the timer alone without stopTimer', () => {
    const r = logTime(repo, {}, entry, { id: ulid0 });
    if (!r.ok) throw new Error('expected ok');
    expect(Object.keys(r.value.changes)).toEqual([MONTH]);
  });

  it('refuses an invalid entry', () => {
    expect(logTime(repo, {}, { ...entry, minutes: 0 }, { id: ulid0 }).ok).toBe(false);
    expect(logTime(repo, {}, { ...entry, note: '' }, { id: ulid0 }).ok).toBe(false);
  });
});

describe('cancelTimer', () => {
  it('deletes the timer file', () => {
    const r = cancelTimer({ ...repo, timer: t });
    expect(r.ok && r.value.changes).toEqual({ [TIMER_PATH]: null });
  });
});

describe('running timer file', () => {
  const withTimer = (text: string) => new Map([...files, [TIMER_PATH, text]]);

  it('classifies the path and loads the timer', () => {
    expect(classifyBusinessPath(TIMER_PATH)).toEqual({ kind: 'timer' });
    const loaded = loadBusinessRepo(
      withTimer('client: acme-gmbh\nstarted_at: 2026-11-02T09:00:00+01:00\n'),
    );
    expect(loaded.timer).toEqual({ client: 'acme-gmbh', started_at: '2026-11-02T09:00:00+01:00' });
    expect(loaded.findings).toEqual([]);
  });

  it('reports a timer without offset as an error at the file', () => {
    const loaded = loadBusinessRepo(
      withTimer('client: acme-gmbh\nstarted_at: 2026-11-02T09:00:00\n'),
    );
    expect(loaded.timer).toBeNull();
    expect(loaded.findings).toContainEqual(
      expect.objectContaining({ file: TIMER_PATH, level: 'error' }),
    );
  });

  it('check: unknown client or project is an error at the timer file', () => {
    const run = (text: string) =>
      checkBusinessRepo({ files: withTimer(text), changes: null, today: '2026-11-02' }).filter(
        (f) => f.level === 'error',
      );
    expect(run('client: acme-gmbh\nstarted_at: 2026-11-02T09:00:00Z\n')).toEqual([]);
    expect(run('client: nobody\nstarted_at: 2026-11-02T09:00:00Z\n')).toEqual([
      expect.objectContaining({ file: TIMER_PATH, path: 'client' }),
    ]);
    expect(run('client: acme-gmbh\nproject: nope\nstarted_at: 2026-11-02T09:00:00Z\n')).toEqual([
      expect.objectContaining({ file: TIMER_PATH, path: 'project' }),
    ]);
  });
});
