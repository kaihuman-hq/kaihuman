import { describe, expect, it } from 'vitest';
import {
  actionLogLabel,
  fileLabel,
  formatFilePath,
  pruneFocus,
  withBusinessFiles,
} from './scope-files';

const tree = [
  { path: 'todos/work.todos.md', type: 'blob' },
  { path: '.kh/business/clients/acme-gmbh/todos.todos.md', type: 'blob' },
  { path: '.kh/business/clients/acme-gmbh/log.actionlog.md', type: 'blob' },
];
const client = '.kh/business/clients/acme-gmbh/todos.todos.md';

describe('withBusinessFiles', () => {
  it('adds client files for all', () => {
    expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'all')).toEqual([
      'todos/work.todos.md',
      client,
    ]);
  });
  it('keeps only business files for business', () => {
    expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'business')).toEqual([
      client,
    ]);
  });
  it('keeps only personal files for personal', () => {
    expect(withBusinessFiles(['todos/work.todos.md'], tree, '.todos.md', 'personal')).toEqual([
      'todos/work.todos.md',
    ]);
  });
  it('dedupes and keeps input order first', () => {
    expect(withBusinessFiles([client, 'todos/work.todos.md'], tree, '.todos.md', 'all')).toEqual([
      client,
      'todos/work.todos.md',
    ]);
  });
  it('uses the suffix', () => {
    expect(withBusinessFiles([], tree, '.actionlog.md', 'all')).toEqual([
      '.kh/business/clients/acme-gmbh/log.actionlog.md',
    ]);
  });
});

describe('fileLabel', () => {
  it('labels client files by slug', () => {
    expect(fileLabel('.kh/business/clients/acme-gmbh/log.actionlog.md')).toBe('acme-gmbh');
  });
  it('falls back to formatFilePath for other files', () => {
    expect(fileLabel('todos/work.todos.md')).toBe(formatFilePath('todos/work.todos.md').name);
    expect(fileLabel('todos/work.todos.md')).toBe('work');
  });
});

describe('actionLogLabel', () => {
  it('labels client logs by slug', () => {
    expect(actionLogLabel('.kh/business/clients/acme-gmbh/log.actionlog.md')).toBe('acme-gmbh');
  });
  it('strips the suffix for other logs', () => {
    expect(actionLogLabel('logs/work.actionlog.md')).toBe('work');
  });
});

describe('pruneFocus', () => {
  const personal = ['todos/work.todos.md'];
  it('drops focused files outside the list', () => {
    expect(pruneFocus(new Set([client]), personal).size).toBe(0);
  });
  it('keeps focus that is still valid, as the same set', () => {
    const focused = new Set(['todos/work.todos.md']);
    expect(pruneFocus(focused, personal)).toBe(focused);
  });
});
