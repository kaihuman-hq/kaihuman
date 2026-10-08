import { beforeEach, describe, expect, it } from 'vitest';
import type { ModeItem } from './command-palette.js';
import { localFilesMode, parseLocalFileQuery } from './local-files.js';
import type { ActionPort, PaletteProtocol } from './protocol.js';

let sent: unknown[];
let hits: PaletteProtocol['SEARCH_LOCAL_FILES']['response']['hits'];

const fakePort: ActionPort = {
  send: async (request) => {
    sent.push(request);
    if (request.type === 'SEARCH_LOCAL_FILES') return { home: '/home/me', hits } as never;
    if (request.type === 'OPEN_LOCAL_FILE') return {} as never;
    throw new Error(`no answer for ${request.type}`);
  },
};

const submit = async (query: string): Promise<ModeItem[]> => {
  const mode = localFilesMode(fakePort);
  if (!('submit' in mode)) throw new Error('>o should submit');
  return mode.submit(query);
};

beforeEach(() => {
  sent = [];
  hits = [];
});

describe('parseLocalFileQuery', () => {
  const home = { contents: false, everywhere: false };

  it('searches names in the home directory unless the query starts with c: or a:', () => {
    expect(parseLocalFileQuery('  tax report ')).toEqual({ ...home, text: 'tax report' });
    expect(parseLocalFileQuery('abc: x')).toEqual({ ...home, text: 'abc: x' });
    expect(parseLocalFileQuery('x c: y')).toEqual({ ...home, text: 'x c: y' });
  });

  it('reads c: as contents too and a: as the whole file system, in either order', () => {
    expect(parseLocalFileQuery('c: budget')).toEqual({ ...home, text: 'budget', contents: true });
    expect(parseLocalFileQuery('C:budget 2026')).toEqual({
      ...home,
      text: 'budget 2026',
      contents: true,
    });
    expect(parseLocalFileQuery('a: nginx')).toEqual({ ...home, text: 'nginx', everywhere: true });
    const both = { text: 'nginx', contents: true, everywhere: true };
    expect(parseLocalFileQuery('a: c: nginx')).toEqual(both);
    expect(parseLocalFileQuery('c:a:nginx')).toEqual(both);
  });
});

describe('localFilesMode', () => {
  it('is >o and keeps no recents', () => {
    const mode = localFilesMode(fakePort);
    expect(mode.prefix).toBe('o');
    expect(mode.recents).toBe(false);
  });

  it('asks for names in the home directory by default, for contents after c:, everywhere after a:', async () => {
    await submit('report');
    await submit('c: budget');
    await submit('a: nginx');
    expect(sent).toEqual([
      { type: 'SEARCH_LOCAL_FILES', query: 'report', contents: false, everywhere: false },
      { type: 'SEARCH_LOCAL_FILES', query: 'budget', contents: true, everywhere: false },
      { type: 'SEARCH_LOCAL_FILES', query: 'nginx', contents: false, everywhere: true },
    ]);
  });

  it('asks nothing for flags alone', async () => {
    expect(await submit('c:')).toEqual([]);
    expect(await submit('a: c:')).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('lists each hit by name, its folder shortened to ~', async () => {
    hits = [
      { path: '/home/me/Documents/tax.pdf', folder: false },
      { path: '/home/me/reports', folder: true },
    ];
    const items = await submit('report');
    expect(items.map(({ title, subtitle, group }) => ({ title, subtitle, group }))).toEqual([
      { title: 'tax.pdf', subtitle: '~/Documents', group: undefined },
      { title: 'reports/', subtitle: '~', group: undefined },
    ]);
  });

  it('shows the matching line and tells names from contents apart', async () => {
    hits = [
      { path: '/home/me/budget.txt', folder: false },
      { path: '/srv/notes.md', folder: false, line: '2:The budget for 2026' },
    ];
    const items = await submit('c: budget');
    expect(items.map(({ subtitle, group }) => ({ subtitle, group }))).toEqual([
      { subtitle: '~', group: 'Names' },
      { subtitle: '/srv · 2:The budget for 2026', group: 'Contents' },
    ]);
  });

  it('opens a file with its default app, and its folder in the file manager or a terminal', async () => {
    hits = [{ path: '/home/me/Documents/tax.pdf', folder: false }];
    const [item] = await submit('tax');
    expect(item?.action?.closes).toBe(true);
    expect(item?.children?.map((child) => child.title)).toEqual([
      'Open with the default app',
      'Open ~/Documents in the file manager',
      'Open ~/Documents in a terminal',
    ]);
    sent = [];
    await item?.action?.run?.([]);
    for (const child of item?.children ?? []) await child.action?.run?.([]);
    expect(sent).toEqual(
      ['app', 'app', 'file-manager', 'terminal'].map((how) => ({
        type: 'OPEN_LOCAL_FILE',
        path: '/home/me/Documents/tax.pdf',
        with: how,
      })),
    );
  });

  it('opens a folder itself in the file manager or a terminal', async () => {
    hits = [{ path: '/home/me/reports', folder: true }];
    const [item] = await submit('reports');
    expect(item?.action?.title).toBe('Open in the file manager');
    expect(item?.children?.map((child) => child.title)).toEqual([
      'Open ~/reports in the file manager',
      'Open ~/reports in a terminal',
    ]);
  });
});
