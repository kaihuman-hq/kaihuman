import { parseTodos } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import type { RepoFiles } from './quick-capture.js';
import {
  normalizeTag,
  parseTodoRef,
  TodoDetailController,
  todoDetailHref,
  todoRefId,
} from './todo-detail.js';

class MemoryFiles implements RepoFiles {
  writes: string[] = [];
  failWrites = false;
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    if (this.failWrites) throw new Error('offline');
    this.writes.push(p);
    this.store.set(p, c);
  }
}

const INBOX = '.kh/inbox.todos.md';
const WORK = '.kh/work.todos.md';
const inbox = [
  '---',
  'milestones:',
  '  - id: launch',
  '    name: Launch',
  '    dueDate: 2026-12-01',
  '---',
  '',
  '- [ ] First #home',
  '::updated:: 1 ::created:: 2026-11-01T10:00:00.000Z',
  '- [>] Second #work !launch',
  '::created:: 2026-11-02T10:00:00.000Z ::due:: 2026-11-20',
  '',
].join('\n');
const work = '- [ ] Ship it #errands\n';

const setup = (files = { [INBOX]: inbox, [WORK]: work }) => {
  const mem = new MemoryFiles(new Map(Object.entries(files)));
  return { mem, items: (p = INBOX) => parseTodos(mem.store.get(p) ?? '').items };
};

const ready = async (id: string, mem: MemoryFiles) => {
  const c = new TodoDetailController(id, mem);
  const state = await c.load();
  if (state.kind !== 'ready') throw new Error(`expected ready, got ${state.kind}`);
  return c;
};

describe('todo refs', () => {
  it('parses the widget id `<path>#<index>` and rejects anything else', () => {
    expect(parseTodoRef(`${INBOX}#1`)).toEqual({ path: INBOX, index: 1 });
    expect(parseTodoRef('a/b#c.todos.md#12')).toEqual({ path: 'a/b#c.todos.md', index: 12 });
    expect(parseTodoRef('item-3')).toBeNull();
    expect(parseTodoRef(`${INBOX}#x`)).toBeNull();
    expect(parseTodoRef('notes.md#1')).toBeNull();
  });

  it('builds the detail href with an encoded id that round-trips', () => {
    const id = todoRefId({ path: INBOX, index: 0 });
    expect(id).toBe(`${INBOX}#0`);
    expect(todoDetailHref(id)).toBe('/board/todo?id=.kh%2Finbox.todos.md%230');
    expect(decodeURIComponent(todoDetailHref(id).split('id=')[1] ?? '')).toBe(id);
  });

  it('normalizes typed tags to the format token, or rejects them', () => {
    expect(normalizeTag(' #Home ')).toBe('Home');
    expect(normalizeTag('deep work')).toBe('deep-work');
    expect(normalizeTag('#')).toBeUndefined();
    expect(normalizeTag('a!b')).toBeUndefined();
  });
});

describe('TodoDetailController.load', () => {
  it('loads the item with repo-wide milestones and tag suggestions', async () => {
    const { mem } = setup();
    const c = new TodoDetailController(`${INBOX}#1`, mem);
    expect(c.state.kind).toBe('loading');
    const state = await c.load();
    expect(state).toMatchObject({
      kind: 'ready',
      path: INBOX,
      index: 1,
      item: { text: 'Second', status: 'in-progress', tags: ['work'], milestoneId: 'launch' },
    });
    if (state.kind !== 'ready') return;
    expect(state.item.dueDate).toBe('2026-11-20');
    expect(state.milestones.map((m) => m.id)).toEqual(['launch']);
    expect(state.tagSuggestions).toEqual(['errands', 'home']);
  });

  it('is not found for a missing file, an index past the end, or a bad id', async () => {
    const { mem } = setup();
    for (const id of ['.kh/gone.todos.md#0', `${INBOX}#5`, 'item-0']) {
      expect((await new TodoDetailController(id, mem).load()).kind, id).toBe('not-found');
    }
  });

  it('follows the item when an earlier one was removed elsewhere', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    mem.store.set(INBOX, inbox.replace(/- \[ \] First.*\n.*\n/, ''));
    const state = await c.load();
    expect(state).toMatchObject({ kind: 'ready', index: 0, item: { text: 'Second' } });
    expect(c.id).toBe(`${INBOX}#0`);
  });

  it('is not found when the item was deleted elsewhere', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    mem.store.set(INBOX, inbox.replace(/- \[>\] Second.*\n.*\n/, ''));
    expect((await c.load()).kind).toBe('not-found');
  });
});

describe('TodoDetailController edits', () => {
  it('saves the title through updateTodoText, flattened to one line', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.setTitle('  Call\nthe   bank ')).toEqual({ ok: true });
    expect(items()[0]).toMatchObject({ text: 'Call the bank', tags: ['home'] });
    expect(items()[0]?.updatedAt).toBeGreaterThan(1);
    expect(items()[0]?.createdAt).toBe('2026-11-01T10:00:00.000Z');
    expect(c.state).toMatchObject({ kind: 'ready', item: { text: 'Call the bank' } });
  });

  it('rejects an empty title without writing', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.setTitle(' \n ')).toEqual({ ok: false, error: 'A todo needs a title' });
    expect(mem.writes).toEqual([]);
  });

  it('adopts tokens typed into the title the way the file reads back', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    await c.setTitle('Buy milk #errands');
    expect(c.state).toMatchObject({ item: { text: 'Buy milk', tags: ['errands', 'home'] } });
  });

  it('sets status and milestone', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    await c.setStatus('done');
    await c.setMilestone('launch');
    expect(items()[0]).toMatchObject({ status: 'done', milestoneId: 'launch' });
    await c.setMilestone(undefined);
    expect(items()[0]?.milestoneId).toBeUndefined();
  });

  it('adds and removes tags, ignoring duplicates and invalid ones', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.addTag('#Deep work')).toEqual({ ok: true });
    expect(await c.addTag('home')).toEqual({ ok: true });
    expect(await c.addTag('!!')).toEqual({ ok: false, error: 'Tags use letters, digits and -' });
    expect(items()[0]?.tags).toEqual(['home', 'Deep-work']);
    await c.removeTag('home');
    expect(items()[0]?.tags).toEqual(['Deep-work']);
    if (c.state.kind === 'ready') expect(c.state.tagSuggestions).toContain('home');
  });

  it('sets and clears the due date via setTodoDue', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    await c.setDue({ date: '2026-11-15', time: '09:30' });
    expect(items()[0]).toMatchObject({ dueDate: '2026-11-15', dueTime: '09:30' });
    expect(mem.store.get(INBOX)).toContain('::due:: 2026-11-15T09:30');
    await c.setDue(undefined);
    expect(items()[0]?.dueDate).toBeUndefined();
    expect(await c.setDue({ date: '2026-02-31' })).toEqual({
      ok: false,
      error: 'Invalid due date',
    });
  });

  it('edits the current file content, keeping changes synced in meanwhile', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    mem.store.set(INBOX, `${inbox}- [ ] Third\n`);
    await c.setStatus('done');
    expect(items().map((i) => [i.text, i.status])).toEqual([
      ['First', 'backlog'],
      ['Second', 'done'],
      ['Third', 'backlog'],
    ]);
  });

  it('applies rapid edits in order without losing one', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    await Promise.all([c.setStatus('in-progress'), c.addTag('a'), c.setTitle('Renamed')]);
    expect(items()[0]).toMatchObject({
      status: 'in-progress',
      tags: ['home', 'a'],
      text: 'Renamed',
    });
  });

  it('reports a failed save and keeps the last saved state', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    mem.failWrites = true;
    expect(await c.setStatus('done')).toEqual({ ok: false, error: 'offline' });
    expect(c.state).toMatchObject({ kind: 'ready', item: { status: 'backlog' } });
  });

  it('turns into not-found when the item vanished before an edit', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    mem.store.set(INBOX, '');
    expect(await c.setStatus('done')).toEqual({ ok: false, error: 'Todo not found' });
    expect(c.state.kind).toBe('not-found');
  });
});

describe('TodoDetailController delete', () => {
  it('deletes the item and undo restores it in place', async () => {
    const { mem, items } = setup();
    const before = mem.store.get(INBOX);
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.remove()).toEqual({ ok: true });
    expect(items().map((i) => i.text)).toEqual(['Second']);
    expect(c.state).toMatchObject({ kind: 'deleted', item: { text: 'First' } });
    expect(await c.undoRemove()).toEqual({ ok: true });
    expect(mem.store.get(INBOX)).toBe(before);
    expect(c.state).toMatchObject({ kind: 'ready', index: 0, item: { text: 'First' } });
  });

  it('cannot undo when nothing was deleted', async () => {
    const { mem } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.undoRemove()).toEqual({ ok: false, error: 'Nothing to undo' });
  });
});

describe('TodoDetailController recurring todos', () => {
  it('sets, changes and clears the repeat; clearing the due clears it too', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    expect(await c.setRepeat({ unit: 'week', interval: 2, weekdays: [0, 3] })).toEqual({
      ok: true,
    });
    expect(mem.store.get(INBOX)).toContain('::repeat:: every 2 weeks:mon,thu');
    expect(c.state.kind === 'ready' && c.state.item.repeat).toEqual({
      unit: 'week',
      interval: 2,
      weekdays: [0, 3],
    });
    await c.setRepeat({ unit: 'day', interval: 1 });
    expect(items()[1]?.repeat).toEqual({ unit: 'day', interval: 1 });
    await c.setRepeat(undefined);
    expect(items()[1]?.repeat).toBeUndefined();

    await c.setRepeat({ unit: 'month', interval: 1, day: 20 });
    await c.setDue(undefined);
    expect(items()[1]).not.toHaveProperty('repeat');
    expect(mem.store.get(INBOX)).not.toContain('::repeat::');
  });

  it('refuses a repeat without a due date', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#0`, mem);
    expect(await c.setRepeat({ unit: 'day', interval: 1 })).toEqual({
      ok: false,
      error: 'Set a due date first',
    });
    expect(items()[0]?.repeat).toBeUndefined();
  });

  it('completing a recurring todo moves it to the next occurrence instead of done', async () => {
    const { mem, items } = setup();
    const c = await ready(`${INBOX}#1`, mem);
    await c.setRepeat({ unit: 'week', interval: 1, weekdays: [4] }); // 2026-11-20 is a Friday
    expect(await c.setStatus('done')).toEqual({ ok: true });
    const item = items()[1];
    expect(item?.status).toBe('backlog');
    expect(item?.dueDate).toBe('2026-11-27');
    expect(item?.doneLog).toHaveLength(1);
  });
});
