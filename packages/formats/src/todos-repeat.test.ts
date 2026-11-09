import { describe, expect, it } from 'vitest';
import {
  completeTodo,
  nextDue,
  parseTodos,
  serializeTodos,
  setStatus,
  setTodoRepeat,
} from './todos.js';

/** Local noon on a calendar date, so the tests hold in any time zone. */
const at = (date: string, time = '12:00') => new Date(`${date}T${time}:00`).getTime();

describe('todo recurrence in the file format', () => {
  it('leaves files without recurrence byte-identical', () => {
    const md =
      '---\nmilestones:\n  - id: v1\n    name: V1\n    dueDate: 2026-12-01\n---\n\n' +
      '- [ ] a #x !v1 ^high\n::updated:: 1 ::created:: 2026-01-01T00:00:00.000Z ::due:: 2026-11-10\n' +
      '  > prompt\n- [x] b\n::due:: 2026-11-10T14:00\n- [-] c\n';
    const data = parseTodos(md);
    expect(data.items.every((i) => i.repeat === undefined && i.doneLog === undefined)).toBe(true);
    expect(serializeTodos(data)).toBe(md);
  });

  it('parses and round-trips ::repeat:: and ::done::', () => {
    const md =
      '- [ ] water plants\n::updated:: 5 ::due:: 2026-11-12T09:00 ::repeat:: every 2 weeks:mon,thu ::done:: 2026-10-29,2026-11-02\n' +
      '- [ ] rent\n::repeat:: monthly:last\n';
    const data = parseTodos(md);
    expect(data.items[0]).toMatchObject({
      dueDate: '2026-11-12',
      dueTime: '09:00',
      repeat: { unit: 'week', interval: 2, weekdays: [0, 3] },
      doneLog: ['2026-10-29', '2026-11-02'],
    });
    expect(data.items[1]?.repeat).toEqual({ unit: 'month', interval: 1, day: 'last' });
    expect(serializeTodos(data)).toBe(md);
  });

  it('older parsers still read the due date before ::repeat::', () => {
    const line = '::due:: 2026-11-12 ::repeat:: daily';
    expect(line.match(/::due::\s*(.*?)\s*(?=::|$)/)?.[1]).toBe('2026-11-12');
  });

  it('drops malformed rules and log entries', () => {
    const d = parseTodos(
      '- [ ] a\n::due:: 2026-11-10 ::repeat:: hourly ::done:: nope,2026-11-01\n',
    );
    expect(d.items[0]?.repeat).toBeUndefined();
    expect(d.items[0]?.doneLog).toEqual(['2026-11-01']);
  });
});

describe('completeTodo', () => {
  const file = (meta: string, marker = '>') => parseTodos(`- [${marker}] task\n${meta}\n`);

  it('moves a recurring todo to the next occurrence and logs the completion', () => {
    const data = file('::due:: 2026-11-09T08:30 ::repeat:: daily');
    const done = completeTodo(data, 'item-0', at('2026-11-09'));
    expect(done.items[0]).toMatchObject({
      status: 'backlog',
      dueDate: '2026-11-10',
      dueTime: '08:30',
      doneLog: ['2026-11-09'],
    });
    expect(serializeTodos(done)).toContain(
      '::due:: 2026-11-10T08:30 ::repeat:: daily ::done:: 2026-11-09',
    );
  });

  it('skips occurrences missed while overdue', () => {
    const data = file('::due:: 2026-11-02 ::repeat:: weekly:mon');
    expect(completeTodo(data, 'item-0', at('2026-11-12')).items[0]?.dueDate).toBe('2026-11-16');
  });

  it('pins month-end rules on first completion', () => {
    const data = file('::due:: 2026-01-31 ::repeat:: monthly');
    const feb = completeTodo(data, 'item-0', at('2026-01-31'));
    const mar = completeTodo(feb, 'item-0', at('2026-02-28'));
    expect(feb.items[0]?.dueDate).toBe('2026-02-28');
    expect(mar.items[0]?.dueDate).toBe('2026-03-31');
    expect(serializeTodos(mar)).toContain('::repeat:: monthly:31');
  });

  it('starts from today when the recurring todo has no due date', () => {
    const data = file('::repeat:: every 3 days');
    expect(completeTodo(data, 'item-0', at('2026-11-09')).items[0]?.dueDate).toBe('2026-11-12');
  });

  it('caps the completion log', () => {
    let data = file('::due:: 2026-01-01 ::repeat:: daily');
    for (let day = 1; day <= 40; day++) {
      const date = `2026-02-${String((day % 28) + 1).padStart(2, '0')}`;
      data = completeTodo(data, 'item-0', at(date));
    }
    expect(data.items[0]?.doneLog).toHaveLength(30);
  });

  it('marks a plain todo done', () => {
    const data = file('::due:: 2026-11-09');
    expect(completeTodo(data, 'item-0', at('2026-11-09')).items[0]).toMatchObject({
      status: 'done',
      dueDate: '2026-11-09',
    });
    expect(completeTodo(data, 'missing')).toBe(data);
  });

  it('setStatus(done) completes recurring todos instead of finishing them', () => {
    const data = file('::due:: 2000-01-01 ::repeat:: daily');
    const item = setStatus(data, 0, 'done').items[0];
    expect(item?.status).toBe('backlog');
    expect(item?.doneLog).toHaveLength(1);
    expect(setStatus(file('::due:: 2000-01-01'), 0, 'done').items[0]?.status).toBe('done');
  });
});

describe('nextDue / setTodoRepeat', () => {
  it('gives the following due, keeping the time', () => {
    expect(
      nextDue(
        { dueDate: '2026-11-09', dueTime: '07:00', repeat: { unit: 'day', interval: 1 } },
        at('2026-11-09'),
      ),
    ).toEqual({ date: '2026-11-10', time: '07:00' });
    expect(nextDue({ dueDate: '2026-11-09' })).toBeUndefined();
  });

  it('sets and clears a rule', () => {
    const data = parseTodos('- [ ] a\n::due:: 2026-11-09\n');
    const set = setTodoRepeat(data, 'item-0', { unit: 'week', interval: 1, weekdays: [0] });
    expect(serializeTodos(set)).toMatch(/::due:: 2026-11-09 ::repeat:: weekly:mon\n$/);
    expect(serializeTodos(setTodoRepeat(set, 'item-0'))).not.toContain('::repeat::');
    expect(setTodoRepeat(data, 'missing')).toBe(data);
  });
});
