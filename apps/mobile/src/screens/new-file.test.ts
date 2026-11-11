import { describe, expect, it } from 'vitest';
import { NEW_TILE_FILES } from './dashboard-edit.js';
import { NEW_FILE_KINDS, newFile } from './new-file.js';

const kind = (id: string) => {
  const k = NEW_FILE_KINDS.find((x) => x.id === id);
  if (!k) throw new Error(id);
  return k;
};

describe('NEW_FILE_KINDS', () => {
  it('offers a note and every tile kind the add-tile picker creates', () => {
    expect(NEW_FILE_KINDS.map((k) => k.id)).toEqual(['note', ...NEW_TILE_FILES.map((t) => t.kind)]);
  });
});

describe('newFile', () => {
  it('places the file in the chosen folder with the kind starter', () => {
    expect(newFile(kind('habit'), { folder: 'health', name: 'sleep' }, [])).toEqual({
      ok: true,
      path: 'health/sleep.habit.csv',
      content: 'id,title,frequency,target,history\n',
    });
    expect(newFile(kind('note'), { folder: '', name: 'Ideen Büro' }, [])).toMatchObject({
      path: 'ideen-buro.md',
      content: '',
    });
  });

  it('never overwrites an existing file', () => {
    expect(newFile(kind('note'), { folder: 'a', name: 'x' }, ['a/x.md'])).toEqual({
      ok: false,
      error: 'A file with that name already exists.',
    });
  });
});
