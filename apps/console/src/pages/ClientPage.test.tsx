import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({
  state: { status: 'loading' } as unknown,
  backlinks: {} as Record<string, string>,
  enabled: [] as boolean[],
}));
vi.mock('../lib/business/use-business-repo', () => ({
  useBusinessRepo: () => hooks.state,
  useBacklinkContents: (enabled: boolean) => {
    hooks.enabled.push(enabled);
    return hooks.backlinks;
  },
}));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { ClientPage } = await import('./ClientPage');

const repo = { full_name: 'me/biz' } as never;
const dir = '.kh/business/clients/acme-gmbh/';
const ready = (data: BusinessRepo, contents: Record<string, string> = {}): BusinessState => ({
  status: 'ready',
  repo,
  data,
  contents,
  loadErrors: [],
});
const load = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  return loadBusinessRepo(m);
};

let host: HTMLDivElement;
const show = (state: BusinessState, slug = 'acme-gmbh') => {
  hooks.state = state;
  act(() => render(<ClientPage slug={slug} />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  hooks.backlinks = {};
  hooks.enabled = [];
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ClientPage', () => {
  it('says so and links back for an unknown client, without fetching backlinks', () => {
    show(ready(load()), 'nope');
    expect(host.textContent).toContain('No client nope');
    expect(host.querySelector('code')?.textContent).toBe('nope');
    expect(host.querySelector('a[href="/clients"]')?.textContent).toBe('Back to clients');
    expect(hooks.enabled.every((e) => e === false)).toBe(true);
  });

  it('offers to enable business when it is not set up', () => {
    show({ status: 'disabled', repo });
    expect(host.textContent).toContain('Enable business');
  });

  it('renders header, timeline, documents and fetches backlinks', () => {
    show(ready(load()));
    for (const text of ['Acme GmbH', 'RE-2026-0001', 'AN-2026-001', 'PDF missing', 'Timeline']) {
      expect(host.textContent).toContain(text);
    }
    expect(host.textContent).toContain('1001.38 EUR');
    expect(hooks.enabled.at(-1)).toBe(true);
  });

  it('links the first contact by mail', () => {
    show(ready(load()));
    expect(host.querySelector('header a[href="mailto:erika@acme.example"]')).not.toBeNull();
  });

  it('shows the first 20 timeline entries, then all', () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `- 2026-10-${String((i % 28) + 1).padStart(2, '0')} 10:00:00 entry-${i}`,
    ).join('\n');
    const logPath = `${dir}log.actionlog.md`;
    const data = load((m) => m.set(logPath, `# Log\n\n${lines}\n`));
    show(ready(data, { [logPath]: `# Log\n\n${lines}\n` }));
    const count = () => host.querySelectorAll('section:first-of-type li, li.flex').length;
    expect(host.textContent).toContain('Show all');
    expect(host.textContent).not.toContain('entry-0 ');
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Show all'),
    ) as HTMLButtonElement;
    const before = count();
    act(() => button.click());
    expect(count()).toBeGreaterThan(before);
    expect(host.textContent).not.toContain('Show all');
  });

  it('renders todos read-only and the action log', () => {
    const todos = `${dir}todos.todos.md`;
    const log = `${dir}log.actionlog.md`;
    const todoText = '- [x] Ship it\n- [ ] Call back\n';
    const logText = '# Log\n\n- 2026-10-02 09:00:00 Kickoff call\n';
    const data = load((m) => {
      m.set(todos, todoText);
      m.set(log, logText);
    });
    show(ready(data, { [todos]: todoText, [log]: logText }));
    expect(host.textContent).toContain('Ship it');
    expect(host.textContent).toContain('Call back');
    expect(host.textContent).toContain('Kickoff call');
    const boxes = [...host.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.disabled)).toBe(true);
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
  });

  it('shows notes and linked wiki pages', () => {
    const notes = `${dir}notes.md`;
    const data = load((m) => m.set(notes, 'Prefers email.'));
    hooks.backlinks = {
      '.kh/wiki/a.md': 'see [[client:acme-gmbh]]',
      '.kh/wiki/b.md': 'nothing',
    };
    show(ready(data, { [notes]: 'Prefers email.' }));
    expect(host.textContent).toContain('Prefers email.');
    expect(host.textContent).toContain('.kh/wiki/a.md');
    expect(host.textContent).not.toContain('.kh/wiki/b.md');
    expect(host.querySelector('a[href="/wiki"]')).not.toBeNull();
  });

  it("lists only this client's problems", () => {
    const data = load((m) => {
      m.set('.kh/business/clients/other/client.yaml', 'name: [unclosed');
      m.set(`${dir}projects/broken.yaml`, 'name: [unclosed');
    });
    show(ready(data));
    expect(host.textContent).toContain('1 file has problems');
    expect(host.textContent).toContain('projects/broken.yaml');
    expect(host.textContent).not.toContain('clients/other');
  });
});
