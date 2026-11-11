import { configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAPTURE_SPECS,
  fileNameFor,
  initialFolder,
  loadLastFolders,
  normalizeFolder,
  parseLastFolders,
  rememberFolder,
  repoFolders,
  resolveTarget,
  slugifyName,
  tileSpec,
} from './create-target.js';

const now = new Date(2026, 10, 11, 9, 0);

describe('names and folders', () => {
  it('slugifies names', () => {
    expect(slugifyName('  Büro Notes! ')).toBe('buro-notes');
    expect(slugifyName('a__b.c')).toBe('a__b.c');
    expect(slugifyName('---')).toBe('');
  });

  it('enforces the suffix once', () => {
    expect(fileNameFor('Work', '.todos.md')).toBe('work.todos.md');
    expect(fileNameFor('work.todos.md', '.todos.md')).toBe('work.todos.md');
    expect(fileNameFor('Work.TODOS.md', '.todos.md')).toBe('work.todos.md');
    expect(fileNameFor('  ', '.md')).toBeNull();
  });

  it('normalizes folders and rejects escapes', () => {
    expect(normalizeFolder(' /notes//work/ ')).toBe('notes/work');
    expect(normalizeFolder('')).toBe('');
    expect(normalizeFolder('a/../b')).toBeNull();
    expect(normalizeFolder('a/b:c')).toBeNull();
  });

  it('lists folders with the root first and hidden ones left out', () => {
    const paths = ['a.md', 'notes/work/x.md', '.kh/raw/y.md', '.github/ci.yml', 'notes/z.md'];
    expect(repoFolders(paths, '.kh')).toEqual(['', '.kh', '.kh/raw', 'notes', 'notes/work']);
  });
});

describe('resolveTarget', () => {
  const tree = ['.kh/inbox.todos.md', 'notes/2026-11-11.md', '.kh/raw/a.md', '.kh/raw/a-2.md'];

  it('appends to an existing file for append kinds', () => {
    expect(resolveTarget(CAPTURE_SPECS.todo, { folder: '.kh', name: 'inbox' }, tree)).toEqual({
      ok: true,
      path: '.kh/inbox.todos.md',
      exists: true,
    });
    expect(resolveTarget(CAPTURE_SPECS.note, { folder: 'notes/', name: 'Ideas' }, tree)).toEqual({
      ok: true,
      path: 'notes/ideas.md',
      exists: false,
    });
  });

  it('takes the next free name for unique kinds', () => {
    expect(resolveTarget(CAPTURE_SPECS.knowledge, { folder: '.kh/raw', name: 'a' }, tree)).toEqual({
      ok: true,
      path: '.kh/raw/a-3.md',
      exists: false,
    });
  });

  it('rejects collisions and bad input for tile files', () => {
    const spec = tileSpec('todos', '.todos.md');
    expect(resolveTarget(spec, { folder: '.kh', name: 'inbox' }, tree)).toMatchObject({
      ok: false,
      error: /exists/,
    });
    expect(resolveTarget(spec, { folder: '..', name: 'x' }, tree)).toMatchObject({ ok: false });
    expect(resolveTarget(spec, { folder: '', name: ' ' }, tree)).toMatchObject({ ok: false });
    expect(resolveTarget(spec, { folder: '', name: 'Top' }, tree)).toMatchObject({
      path: 'top.todos.md',
    });
  });

  it('prefills names from the kind', () => {
    expect(CAPTURE_SPECS.note.defaultName(now)).toBe('dump');
    expect(CAPTURE_SPECS.knowledge.defaultName(now, 'Big Idea')).toBe('2026-11-11-big-idea');
    expect(tileSpec('habit', '.habit.csv').defaultName(now)).toBe('2026-11-11');
  });
});

describe('remembered folders', () => {
  beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

  it('parses only valid entries', () => {
    expect(parseLastFolders('{"note":"notes","bad":3,"esc":"../x"}')).toEqual({ note: 'notes' });
    expect(parseLastFolders('nope')).toEqual({});
    expect(parseLastFolders('[]')).toEqual({});
  });

  it('starts in the last folder per kind, else the default', () => {
    expect(initialFolder(CAPTURE_SPECS.knowledge, loadLastFolders(), '.kh')).toBe('.kh/raw');
    rememberFolder('knowledge', 'sources');
    rememberFolder('note', 'journal');
    expect(initialFolder(CAPTURE_SPECS.knowledge, loadLastFolders(), '.kh')).toBe('sources');
    expect(initialFolder(CAPTURE_SPECS.todo, loadLastFolders(), '.kh')).toBe('.kh');
  });
});
