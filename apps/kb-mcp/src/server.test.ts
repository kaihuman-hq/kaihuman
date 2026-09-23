import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { KnowledgeBase } from './repo.js';
import { createKbServer } from './server.js';
import { makeRepo, SAMPLE_KB } from './test/fixture.js';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(files: Record<string, string> = SAMPLE_KB) {
  const root = await makeRepo(files);
  const server = createKbServer(await KnowledgeBase.open(root));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await (client as Client).callTool({ name, arguments: args })) as CallToolResult;
  return { root, client, call };
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (first?.type !== 'text') throw new Error('expected text content');
  return first.text;
}

const parse = (result: CallToolResult): unknown => JSON.parse(text(result));

describe('kb-mcp server', () => {
  it('lists all tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'kb_add_raw',
      'kb_index',
      'kb_list',
      'kb_log',
      'kb_read',
      'kb_search',
    ]);
  });

  it('kb_search ranks pages', async () => {
    const { call } = await connect();
    const results = parse(await call('kb_search', { query: 'react', limit: 2 })) as {
      file: string;
      score: number;
    }[];
    // react-hooks: title 5 + tag 4 + 1 body hit; state: tag 4 + 1 body hit.
    expect(results.map((r) => [r.file, r.score])).toEqual([
      ['react-hooks.md', 10],
      ['state.md', 5],
    ]);
    expect(results[0]).toMatchObject({ title: 'React Hooks', type: 'concept' });
  });

  it('kb_read returns content and backlinks', async () => {
    const { call } = await connect();
    const page = parse(await call('kb_read', { page: 'vite' }));
    expect(page).toMatchObject({
      file: 'vite.md',
      title: 'Vite',
      content: SAMPLE_KB['.kh/wiki/vite.md'],
      backlinks: [
        { file: 'react-hooks.md', title: 'React Hooks' },
        { file: 'state.md', title: 'State Management' },
      ],
    });
  });

  it('kb_read reports traversal attempts as tool errors', async () => {
    const { call } = await connect();
    const result = await call('kb_read', { page: '../../etc/passwd' });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/outside the wiki directory/);
  });

  it('kb_list filters by type and tag', async () => {
    const { call } = await connect();
    expect(parse(await call('kb_list', { tag: 'REACT' }))).toEqual([
      {
        file: 'react-hooks.md',
        title: 'React Hooks',
        type: 'concept',
        tags: ['react', 'frontend'],
        updated: '2026-04-05',
      },
      { file: 'state.md', title: 'State Management', type: 'topic', tags: ['react'] },
    ]);
    const entities = parse(await call('kb_list', { type: 'entity' })) as { file: string }[];
    expect(entities.map((p) => p.file)).toEqual(['vite.md']);
  });

  it('kb_index and kb_log return catalog and entries', async () => {
    const { call } = await connect();
    expect(text(await call('kb_index'))).toBe(SAMPLE_KB['.kh/index.kb.md']);
    expect(parse(await call('kb_log', { limit: 1 }))).toEqual([
      { date: '2026-04-02', op: 'ingest', title: 'Vite docs', body: 'Created vite.' },
    ]);
  });

  it('kb_add_raw writes a raw note and validates input', async () => {
    const { root, call } = await connect();
    const { path } = parse(
      await call('kb_add_raw', { title: 'New idea', text: 'Body', tags: ['ideas'] }),
    ) as { path: string };
    expect(path).toMatch(/^\.kh\/raw\/\d+-new-idea\.md$/);
    expect(await readdir(join(root, '.kh/raw'))).toEqual([path.slice('.kh/raw/'.length)]);

    const invalid = await call('kb_add_raw', { title: 'x', text: 'y', tags: ['bad, tag'] });
    expect(invalid.isError).toBe(true);
    const badUrl = await call('kb_add_raw', { title: 'x', text: 'y', url: 'not a url' });
    expect(badUrl.isError).toBe(true);
    expect(await readdir(join(root, '.kh/raw'))).toHaveLength(1);
  });
});
