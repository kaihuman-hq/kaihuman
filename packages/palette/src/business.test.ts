import { describe, expect, it } from 'vitest';
import { loadBusinessCapture } from './business.js';
import type { ActionPort, PaletteRequest } from './protocol.js';

const CLIENT = `name: Acme GmbH
address:
  street: Hauptstrasse 5
  postcode: "80331"
  city: Muenchen
  country: DE
payment_terms_days: 14
stage: active
`;
const PROJECT = `client: acme-gmbh
name: Website relaunch
status: active
rate:
  per: hour
  amount: 9500
`;
const CONTEXT = [
  { path: '.kh/business/business.yaml', content: 'name: Me\n' },
  { path: '.kh/business/clients/acme-gmbh/client.yaml', content: CLIENT },
  { path: '.kh/business/clients/acme-gmbh/projects/website.yaml', content: PROJECT },
];
const NOW = new Date('2026-11-03T09:00:00Z');

/** A backend holding `stored` files; it records what was written. */
const backend = (
  context = CONTEXT,
  stored: Record<string, { content: string; sha: string }> = {},
) => {
  const writes: PaletteRequest<'WRITE_BUSINESS_FILE'>[] = [];
  const port: ActionPort = {
    send: async (request) => {
      if (request.type === 'READ_BUSINESS_CONTEXT') return { files: context } as never;
      if (request.type === 'READ_BUSINESS_FILE') {
        const file = stored[(request as PaletteRequest<'READ_BUSINESS_FILE'>).path];
        return (file ?? { content: null }) as never;
      }
      if (request.type === 'WRITE_BUSINESS_FILE') {
        writes.push(request as PaletteRequest<'WRITE_BUSINESS_FILE'>);
        return {} as never;
      }
      throw new Error(`no answer for ${request.type}`);
    },
  };
  return { port, writes };
};

const lookup = async (port: ActionPort) => {
  const found = await loadBusinessCapture(port, 'https://console.example', () => NOW);
  if (!found) throw new Error('business should be set up');
  return found;
};

describe('loadBusinessCapture', () => {
  it('offers nothing when business is not set up', async () => {
    expect(await loadBusinessCapture(backend([]).port, 'https://console.example')).toBeNull();
  });

  it('resolves a client prefix and leaves other text alone', async () => {
    const find = await lookup(backend().port);
    expect(find('todo acme: send draft')).toMatchObject({
      title: 'Add todo for acme-gmbh: send draft',
      subtitle: '.kh/business/clients/acme-gmbh/todos.todos.md',
    });
    expect(find('timer acme/website')?.title).toBe('Start timer for acme-gmbh/website');
    expect(find('todo zeta: send draft')).toBeNull();
    expect(find('send draft')).toBeNull();
    expect(find('stop timer')?.url).toBe('https://console.example/business/time/new?from=timer');
  });

  it('appends a todo over the version read, in one write with the console’s message', async () => {
    const { port, writes } = backend(CONTEXT, {
      '.kh/business/clients/acme-gmbh/todos.todos.md': { content: '# Acme\n', sha: 'v1' },
    });
    const item = (await lookup(port))('todo acme: send draft');
    expect(await item?.action?.run?.([])).toBe('Todo added for acme-gmbh');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      path: '.kh/business/clients/acme-gmbh/todos.todos.md',
      sha: 'v1',
      message: 'business: todo for acme-gmbh',
    });
    expect(writes[0]?.content.startsWith('# Acme\n')).toBe(true);
    expect(writes[0]?.content).toContain('send draft');
  });

  it('creates a log and starts a timer without a version, so an existing file is not overwritten', async () => {
    const { port, writes } = backend();
    const find = await lookup(port);
    expect(await find('log acme: called Jana')?.action?.run?.([])).toBe('Logged for acme-gmbh');
    expect(await find('timer acme/website')?.action?.run?.([])).toBe('Timer started for acme-gmbh');
    expect(writes.map((w) => [w.path, w.sha])).toEqual([
      ['.kh/business/clients/acme-gmbh/log.actionlog.md', undefined],
      ['.kh/business/time/running.yaml', undefined],
    ]);
    expect(writes[1]?.content).toContain('project: website');
  });

  it('refuses a timer that is already running and writes nothing', async () => {
    const { port, writes } = backend(CONTEXT, {
      '.kh/business/time/running.yaml': { content: 'client: acme-gmbh\n', sha: 'v1' },
    });
    const item = (await lookup(port))('timer acme');
    await expect(item?.action?.run?.([])).rejects.toThrow('A timer is already running.');
    expect(writes).toHaveLength(0);
  });
});
