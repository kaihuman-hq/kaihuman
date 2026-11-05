import { describe, expect, it } from 'vitest';
import {
  emptyTimeForm,
  entryFromForm,
  formFromEntry,
  parseHours,
  timeFieldErrors,
} from './time-form.js';

const valid = { client: 'acme-gmbh', project: '', date: '2026-11-02', hours: '1.5', note: 'Work' };

describe('parseHours', () => {
  it.each([
    ['1:30', 90],
    ['1,5', 90],
    ['1.5', 90],
    ['90m', 90],
    ['0:45', 45],
    ['2', 120],
    ['0.01', 1],
  ])('%s is %i minutes', (input, minutes) => expect(parseHours(input)).toBe(minutes));

  it.each(['abc', '', '1:75', '-1', '1:2:3'])('rejects %j', (input) =>
    expect(parseHours(input)).toBeNull());
});

describe('entryFromForm', () => {
  it('builds an entry and trims the note', () => {
    expect(entryFromForm({ ...valid, project: 'website', note: ' Work ' })).toEqual({
      ok: true,
      value: {
        date: '2026-11-02',
        minutes: 90,
        client: 'acme-gmbh',
        project: 'website',
        note: 'Work',
      },
    });
  });

  it('gives a field error for a non-duration', () => {
    const r = entryFromForm({ ...valid, hours: 'abc' });
    expect(timeFieldErrors(r).hours).toContain('Not a duration');
  });

  it.each(['0', '0m'])('refuses %s', (hours) => {
    expect(timeFieldErrors(entryFromForm({ ...valid, hours })).hours).toContain(
      'at least 1 minute',
    );
  });

  it('refuses more than 24 hours', () => {
    expect(timeFieldErrors(entryFromForm({ ...valid, hours: '25' })).hours).toContain('24 hours');
  });

  it('refuses an empty note explicitly', () => {
    expect(timeFieldErrors(entryFromForm({ ...valid, note: '  ' })).note).toContain('note');
  });

  it('rejects a date that does not exist', () => {
    const errors = timeFieldErrors(entryFromForm({ ...valid, date: '2026-02-31' }));
    expect(errors.date).toBe('Enter a date as YYYY-MM-DD.');
  });

  it('reports client and date errors together', () => {
    const errors = timeFieldErrors(entryFromForm({ ...valid, client: '', date: '2026-13-40' }));
    expect(Object.keys(errors).sort()).toEqual(['client', 'date']);
  });
});

describe('formFromEntry', () => {
  it('prefills hours as H:MM', () => {
    expect(
      formFromEntry({ date: '2026-11-02', minutes: 125, client: 'acme-gmbh' as never, note: '' }),
    ).toEqual({ client: 'acme-gmbh', project: '', date: '2026-11-02', hours: '2:05', note: '' });
    expect(emptyTimeForm('2026-11-02').hours).toBe('');
  });
});
