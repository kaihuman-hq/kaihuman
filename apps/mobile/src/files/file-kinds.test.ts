import { describe, expect, it } from 'vitest';
import { fileKindForPath, hasViewer } from './file-kinds.js';

describe('fileKindForPath', () => {
  it.each([
    ['.kh/news.rss.json', { type: 'tile', tile: 'rss' }],
    ['.kh/health.habit.csv', { type: 'tile', tile: 'habit' }],
    ['.kh/trips.travel.json', { type: 'tile', tile: 'travel' }],
    ['.kh/board.board-overview.json', { type: 'tile', tile: 'boardoverview' }],
    ['.kh/command-palette.settings.json', { type: 'tile', tile: 'palettesettings' }],
    ['notes/welcome.md', { type: 'markdown' }],
    ['data/books.csv', { type: 'csv' }],
    ['data/app.json', { type: 'json' }],
    ['.kh/business/business.yaml', { type: 'yaml' }],
    ['images/logo.svg', { type: 'image', mime: 'image/svg+xml' }],
    ['images/photo.JPG', { type: 'image', mime: 'image/jpeg' }],
    ['notes/todo.txt', { type: 'text' }],
    ['LICENSE', { type: 'text' }],
    ['notes/sketch.drawio', { type: 'unknown', ext: 'drawio' }],
  ])('%s', (path, view) => {
    expect(fileKindForPath(path)).toEqual({ encrypted: false, innerPath: path, view });
  });

  it('resolves an encrypted file by its inner kind', () => {
    expect(fileKindForPath('notes/secret.md.enc')).toEqual({
      encrypted: true,
      innerPath: 'notes/secret.md',
      view: { type: 'markdown' },
    });
    expect(fileKindForPath('.kh/vault.todos.md.enc').view).toEqual({ type: 'tile', tile: 'todos' });
  });

  it('only unknown kinds lack a viewer', () => {
    expect(hasViewer({ type: 'unknown', ext: 'xyz' })).toBe(false);
    expect(hasViewer({ type: 'text' })).toBe(true);
  });
});
