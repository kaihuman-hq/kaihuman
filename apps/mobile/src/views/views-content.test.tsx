import { webcrypto } from 'node:crypto';
import { buildDemoSeed, encrypt, type TreeItem } from '@kaihuman/core';
import { asIdeaSlug, newIdea } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  addCommandEntry,
  addPromptEntry,
  presentTile,
  TILE_EXTENSIONS,
} from '../components/widgets/tile-controllers.js';
import {
  type ContentFiles,
  FileEditorController,
  type PasswordPort,
} from '../screens/file-editor-screen.js';
import { IdeasScreenController } from '../screens/ideas-screen.js';
import { KnowledgeScreenController } from '../screens/knowledge-screen.js';
import { WikiScreenController } from '../screens/wiki-screen.js';
import { DashboardPager } from './dashboard-pager.js';
import { FileBrowserView, FileEditorView } from './file-editor-view.js';
import { IdeaDetailView, IdeasView } from './ideas-view.js';
import { KnowledgeView } from './knowledge-view.js';
import { Tile } from './tile-view.js';
import { WikiPageView, WikiView } from './wiki-view.js';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => router,
  // biome-ignore lint/correctness/useExhaustiveDependencies: stands in for the real hook
  useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
}));

afterEach(() => {
  cleanup();
  router.push.mockClear();
});

beforeAll(() => {
  // Core's encrypt reads `window.crypto.subtle`; jsdom may not provide it.
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
  if (!window.crypto?.subtle) {
    Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  }
});

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const seed = buildDemoSeed(NOW).files;

const memoryFiles = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  const files: ContentFiles = {
    tree: () =>
      [...map.keys()].map(
        (path): TreeItem => ({ path, mode: '100644', type: 'blob', sha: path, url: '' }),
      ),
    refresh: async () => {},
    read: async (path) => {
      const content = map.get(path);
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    },
    write: async (path, content) => {
      map.set(path, content);
    },
    create: async (path, content) => {
      if (map.has(path)) throw new Error(`exists ${path}`);
      map.set(path, content);
    },
    remove: async (path) => void map.delete(path),
    rename: async () => {},
  };
  return { map, files };
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

// The RSS tile would fetch real feeds on mount.
vi.mock('../files/feed-store.js', () => ({
  feedStore: { snapshot: () => ({}), subscribe: () => () => {}, ensure: async () => {} },
}));

const demo = (suffix: string) => {
  const path = Object.keys(seed).find((p) => p.endsWith(suffix));
  if (!path) throw new Error(`no demo file for ${suffix}`);
  return { path, content: seed[path] as string };
};

const prompts = addPromptEntry('', 'Greet', 'Hello {{name}}, welcome', ['x']);
const commands = addCommandEntry('', 'Deploy', 'deploy --env {{env}}', ['ops']);
if (!prompts.ok || !commands.ok) throw new Error('fixture');

const fixtures: Record<string, { path: string; content: string }> = {
  todos: demo('projects.todos.md'),
  habit: demo('.habit.csv'),
  timetracking: demo('.timetracking.csv'),
  events: demo('.events.csv'),
  actionlog: demo('.actionlog.md'),
  timezones: demo('.timezones.json'),
  readitlater: demo('.readitlater.json'),
  bookmarks: demo('.bookmarks.json'),
  budget: demo('.budget.csv'),
  stocks: demo('.stocks.csv'),
  consumption: demo('.consumption.csv'),
  datacollection: demo('.data-collection.csv'),
  prompts: { path: '.kh/a.prompts.md', content: prompts.content },
  commands: { path: '.kh/a.commands.md', content: commands.content },
  rss: demo('.rss.json'),
  travel: demo('.travel.json'),
  boardoverview: demo('.board-overview.json'),
  palettesettings: demo('command-palette.settings.json'),
};

const renderTile = (kind: string, onWrite = vi.fn()) => {
  const f = fixtures[kind] as { path: string; content: string };
  const tile = presentTile(f.path, f.content, NOW);
  if (!tile) throw new Error(`no tile for ${kind}`);
  render(<Tile path={f.path} tile={tile} content={f.content} now={NOW} onWrite={onWrite} />);
  return { onWrite, f };
};

describe('tiles', () => {
  it('has a fixture for every tile extension and renders each kind', () => {
    expect(Object.keys(fixtures)).toHaveLength(TILE_EXTENSIONS.length);
    for (const kind of Object.keys(fixtures)) {
      renderTile(kind);
      expect(screen.getByTestId(`tile-${kind}`)).toBeTruthy();
      cleanup();
    }
  });

  it('todos: toggle writes the new content; add task validates', () => {
    const { onWrite, f } = renderTile('todos');
    fireEvent.click(screen.getAllByRole('checkbox', { checked: false })[0] as HTMLElement);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite.mock.calls[0]?.[0]).toBe(f.path);
    expect(onWrite.mock.calls[0]?.[1]).not.toBe(f.content);
    press('Add task');
    expect(screen.getByRole('alert').textContent).toBe('Enter a task');
    type('New task', 'Buy milk');
    press('Add task');
    expect(onWrite).toHaveBeenCalledTimes(2);
    expect(onWrite.mock.calls[1]?.[1]).toContain('Buy milk');
  });

  it('habit: check-in toggles', () => {
    const { onWrite } = renderTile('habit');
    press(/check-in|Check in/);
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('timetracking: clock in', () => {
    const { onWrite } = renderTile('timetracking');
    press(/^Clock (in|out)$/);
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('events: grouped by day with a date block, full width', () => {
    renderTile('events');
    expect(screen.getByTestId('events-day-Mon 9 Nov')).toBeTruthy();
    expect(screen.getAllByText('NOV').length).toBeGreaterThan(0);
    expect(screen.getByText('Team Offsite')).toBeTruthy();
  });

  it('events: add event', () => {
    const { onWrite } = renderTile('events');
    press('Add event');
    type('Event name', 'Party');
    type('Event date (YYYY-MM-DD)', '2026-12-24');
    press('Save event');
    expect(onWrite.mock.calls[0]?.[1]).toContain('Party');
  });

  it('actionlog: log action', () => {
    const { onWrite } = renderTile('actionlog');
    type('What did you do?', 'Ran 5k');
    press('Log action');
    expect(onWrite.mock.calls[0]?.[1]).toContain('Ran 5k');
  });

  it('timezones: shows clocks', () => {
    renderTile('timezones');
    expect(screen.getAllByText(/^\d\d:\d\d$/).length).toBeGreaterThan(0);
  });

  it('readitlater: add, mark read, clear read', () => {
    const { onWrite } = renderTile('readitlater');
    type('Page URL', 'https://example.com/a');
    press('Save page');
    expect(onWrite.mock.calls[0]?.[1]).toContain('https://example.com/a');
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: /^Mark .* as read$/ })[0] as HTMLElement,
    );
    expect(onWrite).toHaveBeenCalledTimes(2);
    press('Clear read');
    expect(onWrite).toHaveBeenCalledTimes(3);
    type('Page URL', 'nope');
    press('Save page');
    expect(screen.getByRole('alert').textContent).toBe('Enter an http(s) URL');
  });

  it('bookmarks: search filters, add and delete write', () => {
    const { onWrite } = renderTile('bookmarks');
    expect(screen.getAllByTestId(/^bookmark-/).length).toBeGreaterThan(1);
    type('Search bookmarks', 'zzz-no-match');
    expect(screen.queryAllByTestId(/^bookmark-/)).toHaveLength(0);
    expect(screen.getByText('No bookmarks match.')).toBeTruthy();
    type('Search bookmarks', '');
    type('Bookmark URL', 'https://new.example.org/');
    press('Add bookmark');
    expect(onWrite.mock.calls[0]?.[1]).toContain('https://new.example.org/');
    // Delete lives in the long-press menu; see dashboard-tiles.test.tsx.
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('budget, stocks, consumption and data collection show their figures', () => {
    renderTile('budget');
    expect(screen.getByText('Income')).toBeTruthy();
    cleanup();
    renderTile('stocks');
    expect(screen.getByText('Profit')).toBeTruthy();
    cleanup();
    renderTile('consumption');
    expect(screen.getAllByText(/^Reading \d+ on /).length).toBeGreaterThan(0);
    cleanup();
    renderTile('datacollection');
    expect(screen.getByText(/rows$/)).toBeTruthy();
  });

  it('prompts and commands interpolate parameters', () => {
    renderTile('prompts');
    press('Greet');
    type('Greet: name', 'Kai');
    expect(screen.getByTestId('preview-Greet').textContent).toBe('Hello Kai, welcome');
    cleanup();
    const { onWrite } = renderTile('commands');
    press('Deploy');
    expect(screen.getByText('Missing: env')).toBeTruthy();
    type('Deploy: env', 'prod');
    expect(screen.getByTestId('preview-Deploy').textContent).toBe('deploy --env prod');
    press('Add command');
    type('New command title', 'Ls');
    type('New command text', 'ls -la');
    press('Save command');
    expect(onWrite.mock.calls[0]?.[1]).toContain('ls -la');
  });
});

describe('DashboardPager', () => {
  it('lists tiles and navigates', () => {
    const onNavigate = vi.fn();
    const todos = fixtures.todos as { path: string; content: string };
    render(
      <DashboardPager
        pages={[{ id: 'today', name: 'Today', files: [todos] }]}
        defaulted
        now={NOW}
        onWrite={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(1);
    for (const label of ['Board', 'Analytics', 'Ideas', 'Wiki', 'Knowledge', 'Files', 'Repos']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    press('Quick todo');
    expect(onNavigate).toHaveBeenCalledWith('/quick-todo');
  });

  it('shows an empty state', () => {
    render(
      <DashboardPager
        pages={[{ id: 'today', name: 'Today', files: [] }]}
        defaulted
        now={NOW}
        onWrite={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('No dashboard files in this repository')).toBeTruthy();
  });
});

describe('IdeasView', () => {
  const day = new Date(2026, 10, 4);
  const setup = () => {
    const { map, files } = memoryFiles({
      '.kh/ideas/alpha.md': newIdea({ title: 'Alpha' }, { now: day, author: 'human' }).content,
    });
    return { map, controller: new IdeasScreenController({ files, now: () => NOW }) };
  };

  it('lists ideas and logs to one from its detail screen', async () => {
    const { map, controller } = setup();
    const slug = asIdeaSlug('alpha');
    if (!slug) throw new Error('bad slug');
    render(<IdeaDetailView controller={controller} slug={slug} />);
    await screen.findByLabelText('Log entry');
    type('Log entry', 'Thought about it');
    press('Add log');
    await waitFor(() => expect(map.get('.kh/ideas/alpha.md')).toContain('Thought about it'));
  });

  it('creates an idea', async () => {
    const { map, controller } = setup();
    render(<IdeasView controller={controller} />);
    await screen.findByText('Alpha');
    press('New idea');
    type('New idea title', 'Beta');
    press('Create idea');
    await waitFor(() => expect(map.has('.kh/ideas/beta.md')).toBe(true));
  });
});

describe('WikiView', () => {
  const pages = {
    '.kh/wiki/home.md': '---\ntitle: Home\ntags: [a]\n---\nSee [[Other]] and [[Ghost]].',
    '.kh/wiki/other.md': '---\ntitle: Other\n---\nBack to [[home]].',
  };

  it('lists pages, renders one and links to a wiki page', async () => {
    const controller = new WikiScreenController({ files: memoryFiles(pages).files });
    render(<WikiView controller={controller} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Home/ }));
    expect(router.push).toHaveBeenCalledWith('/wiki/home');
    cleanup();
    render(<WikiPageView controller={controller} path=".kh/wiki/home.md" />);
    await screen.findByTestId('wiki-page');
    expect(screen.getByTestId('wiki-page').textContent).toContain('See Other and Ghost.');
    expect(screen.queryByRole('link', { name: 'Ghost' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Other' }));
    expect(router.push).toHaveBeenLastCalledWith('/wiki/other');
    cleanup();
    render(<WikiPageView controller={controller} path=".kh/wiki/other.md" />);
    expect(await screen.findByRole('heading', { name: 'Other' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Home' })); // backlink
    expect(router.push).toHaveBeenLastCalledWith('/wiki/home');
  });

  it('shows an empty state', async () => {
    const controller = new WikiScreenController({ files: memoryFiles().files });
    render(<WikiView controller={controller} />);
    expect(await screen.findByText('No wiki pages')).toBeTruthy();
  });
});

describe('KnowledgeView', () => {
  it('lists the inbox and adds a raw note', async () => {
    const { map, files } = memoryFiles({
      '.kh/raw/100-first.md': '---\ntitle: "First note"\n---\nbody',
    });
    const controller = new KnowledgeScreenController({ files, now: () => NOW });
    render(<KnowledgeView controller={controller} />);
    expect(await screen.findByText('First note')).toBeTruthy();
    type('New note', 'Remember the milk');
    press('Add note');
    expect(await screen.findByText('Remember the milk')).toBeTruthy();
    expect([...map.keys()].some((p) => p.startsWith('.kh/raw/') && p.includes('remember'))).toBe(
      true,
    );
  });
});

describe('file editor', () => {
  const passwordPort = (): PasswordPort => {
    const saved = new Map<string, string>();
    return {
      getPassword: (p) => saved.get(p),
      setPassword: (p, pw) => void saved.set(p, pw),
      clearPassword: (p) => void saved.delete(p),
    };
  };

  it('browses folders and opens a file', async () => {
    const { files } = memoryFiles({ 'a/b.txt': '1', 'top.md': '2' });
    const controller = new FileEditorController({ files, passwords: passwordPort() });
    const onOpenFile = vi.fn();
    render(<FileBrowserView controller={controller} onOpenFile={onOpenFile} />);
    press('a');
    expect(screen.getByRole('button', { name: 'Files' })).toBeTruthy(); // breadcrumb
    fireEvent.click(screen.getByRole('button', { name: 'b.txt' }));
    expect(onOpenFile).toHaveBeenCalledWith('a/b.txt');
    press('Up one level');
    fireEvent.click(screen.getByRole('button', { name: 'top.md' }));
    expect(onOpenFile).toHaveBeenCalledWith('top.md');
  });

  it('edits and saves a plain file', async () => {
    const { map, files } = memoryFiles({ 'n.md': 'old' });
    const controller = new FileEditorController({ files, passwords: passwordPort() });
    render(<FileEditorView controller={controller} path="n.md" mode="source" />);
    const field = (await screen.findByLabelText('Content')) as HTMLTextAreaElement;
    expect(field.value).toBe('old');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    type('Content', 'new');
    press('Save');
    await waitFor(() => expect(map.get('n.md')).toBe('new'));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('.enc: wrong passphrase errors, right one decrypts, save re-encrypts', async () => {
    const cipher = await encrypt('secret text', 'hunter2');
    const { map, files } = memoryFiles({ 'vault.md.enc': cipher });
    const controller = new FileEditorController({ files, passwords: passwordPort() });
    render(<FileEditorView controller={controller} path="vault.md.enc" mode="source" />);
    await screen.findByLabelText('Passphrase');
    type('Passphrase', 'wrong');
    press('Unlock');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Wrong password or corrupted file.',
    );
    type('Passphrase', 'hunter2');
    press('Unlock');
    const field = (await screen.findByLabelText('Content')) as HTMLTextAreaElement;
    expect(field.value).toBe('secret text');
    type('Content', 'changed');
    press('Save');
    await waitFor(() => expect(map.get('vault.md.enc')).not.toBe(cipher));
    expect(map.get('vault.md.enc')).not.toContain('changed');
  });
});
