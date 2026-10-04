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
  it('searches names unless the query starts with c:', () => {
    expect(parseLocalFileQuery('  tax report ')).toEqual({ text: 'tax report', contents: false });
    expect(parseLocalFileQuery('c: budget')).toEqual({ text: 'budget', contents: true });
    expect(parseLocalFileQuery('C:budget 2026')).toEqual({ text: 'budget 2026', contents: true });
    expect(parseLocalFileQuery('abc: x')).toEqual({ text: 'abc: x', contents: false });
  });
});

describe('localFilesMode', () => {
  it('is >o and keeps no recents', () => {
    const mode = localFilesMode(fakePort);
    expect(mode.prefix).toBe('o');
    expect(mode.recents).toBe(false);
  });

  it('asks for names by default and for contents after c:', async () => {
    await submit('report');
    await submit('c: budget');
    expect(sent).toEqual([
      { type: 'SEARCH_LOCAL_FILES', query: 'report', contents: false },
      { type: 'SEARCH_LOCAL_FILES', query: 'budget', contents: true },
    ]);
  });

  it('asks nothing for c: alone', async () => {
    expect(await submit('c:')).toEqual([]);
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
