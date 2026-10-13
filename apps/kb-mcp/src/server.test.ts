import { readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { GitSync } from './git.js';
import { KnowledgeBase } from './repo.js';
import { createKbServer, type KbServerOptions } from './server.js';
import { git, makeGitRepo, makeRepo, SAMPLE_IDEAS, SAMPLE_KB } from './test/fixture.js';

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(files: Record<string, string> = SAMPLE_KB) {
  return connectTo(await makeRepo(files));
}

async function connectTo(root: string, options: KbServerOptions = {}) {
  const server = createKbServer(await KnowledgeBase.open(root), options);
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
      'ideas_append',
      'ideas_create',
      'ideas_find',
      'ideas_import',
      'ideas_list',
      'ideas_read',
      'ideas_set_status',
      'ideas_set_summary',
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

const IDEAS = { ...SAMPLE_KB, ...SAMPLE_IDEAS };
const PALETTE = '.kh/ideas/palette-sync.md';
const NOT_COMMITTED = /not committed: git sync is off/;

interface Written {
  slug: string;
  path: string;
  git: string;
}

describe('ideas tools', () => {
  it('ideas_list shows open ideas, newest activity first, with filters', async () => {
    const { call } = await connect(IDEAS);
    const open = parse(await call('ideas_list')) as Record<string, unknown>[];
    expect(open).toEqual([
      {
        slug: 'palette-sync',
        title: 'Offline sync for the desktop palette',
        status: 'exploring',
        product: 'kaihuman',
        tags: ['palette', 'sync'],
        updated: '2026-10-02T18:40+02:00',
        activity: { level: expect.any(String), recent: expect.any(Number), total: 2 },
        openChallenges: 1,
        lastLog: { at: '2026-10-02 18:40', author: 'claude', text: 'Checked the queue design.' },
      },
    ]);
    const all = parse(await call('ideas_list', { includeClosed: true })) as { slug: string }[];
    expect(all.map((i) => i.slug)).toEqual(['palette-sync', 'old-plan']);
    const dropped = parse(await call('ideas_list', { status: 'dropped' })) as { slug: string }[];
    expect(dropped.map((i) => i.slug)).toEqual(['old-plan']);
    const other = parse(await call('ideas_list', { product: 'OTHER', includeClosed: true }));
    expect((other as { slug: string }[]).map((i) => i.slug)).toEqual(['old-plan']);
    expect((await call('ideas_list', { status: 'nope' })).isError).toBe(true);
  });

  it('ideas_list is empty without an ideas folder', async () => {
    const { call } = await connect();
    expect(parse(await call('ideas_list'))).toEqual([]);
  });

  it('ideas_find ranks matches and returns at most 10', async () => {
    const files: Record<string, string> = { ...IDEAS };
    for (let i = 0; i < 12; i++) files[`.kh/ideas/sync-${i}.md`] = `# Sync ${i}\n`;
    const { call } = await connect(files);
    const exact = parse(await call('ideas_find', { query: 'palette-sync' })) as { slug: string }[];
    expect(exact[0]?.slug).toBe('palette-sync');
    const palette = parse(await call('ideas_find', { query: 'desktop palette' }));
    expect((palette as { slug: string }[]).map((i) => i.slug)).toEqual(['palette-sync']);
    expect(parse(await call('ideas_find', { query: 'sync' }))).toHaveLength(10);
    expect(parse(await call('ideas_find', { query: 'zebra' }))).toEqual([]);
  });

  it('ideas_read returns the file and its parsed fields', async () => {
    const { call } = await connect(IDEAS);
    expect(parse(await call('ideas_read', { slug: 'palette-sync' }))).toMatchObject({
      slug: 'palette-sync',
      path: PALETTE,
      content: SAMPLE_IDEAS[PALETTE],
      title: 'Offline sync for the desktop palette',
      status: 'exploring',
      summary: 'Queue palette commands while offline.',
      challenges: [
        { done: false, text: 'What happens on conflicts?' },
        { done: true, text: 'Is the queue durable?' },
      ],
      braindump: 'my raw words',
      activity: { total: 2 },
    });
  });

  it('rejects bad, unknown and escaping slugs', async () => {
    const { root, call } = await connect(IDEAS);
    for (const slug of ['../../etc/passwd', '../wiki/vite', 'Palette', 'a', '.hidden']) {
      const result = await call('ideas_read', { slug });
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/is not an idea slug/);
    }
    const unknown = await call('ideas_read', { slug: 'no-such-idea' });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toMatch(/No idea "no-such-idea"/);

    await writeFile(join(root, 'secret.md'), 'secret');
    await symlink(join(root, 'secret.md'), join(root, '.kh/ideas/escape.md'));
    for (const [name, args] of [
      ['ideas_read', { slug: 'escape' }],
      ['ideas_append', { slug: 'escape', kind: 'log', text: 'x', author: 'claude' }],
    ] as const) {
      const result = await call(name, args);
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/outside the ideas folder/);
    }
    expect(await readFile(join(root, 'secret.md'), 'utf8')).toBe('secret');
  });

  it('ideas_create writes a new idea and never overwrites one', async () => {
    const { root, call } = await connect(IDEAS);
    const created = parse(
      await call('ideas_create', {
        title: 'Weekly review mail',
        product: 'kaihuman',
        tags: ['mail'],
        summary: 'Send a weekly digest.',
        braindump: 'I want a mail on Sundays.',
        author: 'claude',
      }),
    ) as Written;
    expect(created).toMatchObject({
      slug: 'weekly-review-mail',
      path: '.kh/ideas/weekly-review-mail.md',
    });
    expect(created.git).toMatch(NOT_COMMITTED);
    const content = await readFile(join(root, created.path), 'utf8');
    expect(content).toContain('title: "Weekly review mail"\nstatus: seed\nproduct: kaihuman');
    expect(content).toMatch(/- \d{4}-\d{2}-\d{2} \d{2}:\d{2} · claude · Created\./);
    expect(content).toContain('## Braindump\n\nI want a mail on Sundays.\n');

    const custom = parse(
      await call('ideas_create', { title: 'Other', slug: 'my-slug', author: 'gemini' }),
    ) as Written;
    expect(custom.slug).toBe('my-slug');

    const existing = await call('ideas_create', {
      title: 'Again',
      slug: 'palette-sync',
      author: 'claude',
    });
    expect(existing.isError).toBe(true);
    expect(text(existing)).toMatch(/already exists/);
    expect(await readFile(join(root, PALETTE), 'utf8')).toBe(SAMPLE_IDEAS[PALETTE]);

    for (const args of [
      { title: 'x y', slug: '../escape', author: 'claude' },
      { title: 'x y', author: 'Claude Desktop' },
      { title: 'x y', tags: ['bad tag'], author: 'claude' },
      { title: 'x'.repeat(201), author: 'claude' },
    ]) {
      expect((await call('ideas_create', args)).isError).toBe(true);
    }
    expect((await readdir(join(root, '.kh/ideas'))).sort()).toEqual([
      'Notes_File.md',
      'my-slug.md',
      'old-plan.md',
      'palette-sync.md',
      'weekly-review-mail.md',
    ]);
  });

  it('ideas_append adds log entries, challenges and braindump text', async () => {
    const { root, call } = await connect(IDEAS);
    const append = (kind: string, value: string) =>
      call('ideas_append', { slug: 'palette-sync', kind, text: value, author: 'claude' });
    const logged = parse(await append('log', 'Chose a CRDT.')) as Written;
    expect(logged).toMatchObject({ slug: 'palette-sync', path: PALETTE });
    expect(logged.git).toMatch(NOT_COMMITTED);
    await append('challenge', 'How big can the queue get?');
    await append('braindump', 'more raw words');

    const idea = parse(await call('ideas_read', { slug: 'palette-sync' })) as {
      log: { author: string; text: string }[];
      challenges: { text: string }[];
      braindump: string;
    };
    expect(idea.log.map((e) => e.text)).toEqual([
      'Chose a CRDT.',
      'Checked the queue design.',
      'Created.',
    ]);
    expect(idea.challenges.at(-1)?.text).toBe('How big can the queue get?');
    expect(idea.braindump).toBe('my raw words\n\nmore raw words');

    expect((await append('log', 'x'.repeat(1001))).isError).toBe(true);
    expect((await append('other', 'x')).isError).toBe(true);
    const badAuthor = await call('ideas_append', {
      slug: 'palette-sync',
      kind: 'challenge',
      text: 'x',
      author: 'NOT OK',
    });
    expect(badAuthor.isError).toBe(true);
    const unknown = await call('ideas_append', {
      slug: 'nothing-here',
      kind: 'log',
      text: 'x',
      author: 'claude',
    });
    expect(text(unknown)).toMatch(/No idea "nothing-here"/);
    expect(await readdir(join(root, '.kh/ideas'))).not.toContain('nothing-here.md');
  });

  it('runs concurrent edits one after another, so none is lost', async () => {
    const { call } = await connect(IDEAS);
    const texts = ['One.', 'Two.', 'Three.', 'Four.', 'Five.'];
    await Promise.all(
      texts.map((t) =>
        call('ideas_append', { slug: 'palette-sync', kind: 'log', text: t, author: 'claude' }),
      ),
    );
    const idea = parse(await call('ideas_read', { slug: 'palette-sync' })) as {
      log: { text: string }[];
    };
    expect(idea.log.map((e) => e.text).slice(0, 5)).toEqual([...texts].reverse());
  });

  it('ideas_set_summary and ideas_set_status rewrite only their parts', async () => {
    const { call } = await connect(IDEAS);
    await call('ideas_set_summary', { slug: 'palette-sync', summary: 'Now a sync engine.' });
    const status = parse(
      await call('ideas_set_status', {
        slug: 'palette-sync',
        status: 'parked',
        reason: 'Waiting for the CLI.',
        author: 'claude',
      }),
    ) as Written;
    expect(status.git).toMatch(NOT_COMMITTED);
    const idea = parse(await call('ideas_read', { slug: 'palette-sync' })) as {
      summary: string;
      status: string;
      log: { text: string }[];
      braindump: string;
    };
    expect(idea).toMatchObject({ summary: 'Now a sync engine.', status: 'parked' });
    expect(idea.log[0]?.text).toBe('Status exploring → parked. Waiting for the CLI.');
    expect(idea.braindump).toBe('my raw words');

    const same = await call('ideas_set_status', {
      slug: 'palette-sync',
      status: 'parked',
      author: 'claude',
    });
    expect(text(same)).toMatch(/already parked/);
  });

  it('ideas_import applies every hand-off block, or none', async () => {
    const { root, call } = await connect(IDEAS);
    const paste = [
      'Here you go:',
      '```kh-idea',
      'slug: palette-sync',
      'log: Decided on a durable queue.',
      'challenges:',
      '  - Battery use?',
      '```',
      '```kh-idea',
      'slug: new',
      'title: Voice capture',
      'tags: [voice]',
      '```',
    ].join('\n');
    const result = parse(await call('ideas_import', { text: paste, author: 'claude' })) as {
      ideas: unknown[];
      git: string;
    };
    expect(result.ideas).toEqual([
      { slug: 'palette-sync', path: PALETTE, action: 'updated' },
      { slug: 'voice-capture', path: '.kh/ideas/voice-capture.md', action: 'created' },
    ]);
    expect(result.git).toMatch(NOT_COMMITTED);
    const palette = await readFile(join(root, PALETTE), 'utf8');
    expect(palette).toContain('· claude · Decided on a durable queue.');
    expect(palette).toContain('- [ ] Battery use?');

    const before = await readFile(join(root, PALETTE), 'utf8');
    const failing = [
      '```kh-idea\nslug: palette-sync\nlog: Fine.\n```',
      '```kh-idea\nslug: new\ntitle: Voice capture\n```',
    ].join('\n');
    const failed = await call('ideas_import', { text: failing, author: 'claude' });
    expect(failed.isError).toBe(true);
    expect(text(failed)).toMatch(/"voice-capture" already exists/);
    expect(await readFile(join(root, PALETTE), 'utf8')).toBe(before);

    const traversal = await call('ideas_import', {
      text: '```kh-idea\nslug: ../../x\ntitle: X\n```',
      author: 'claude',
    });
    expect(text(traversal)).toMatch(/is not an idea slug/);
    const empty = await call('ideas_import', { text: 'no blocks here', author: 'claude' });
    expect(text(empty)).toMatch(/no ```kh-idea block/);
  });
});

describe('ideas tools with git sync', () => {
  it('commits and pushes each write, and pulls before reading', async () => {
    const { root, remote, clone } = await makeGitRepo(IDEAS);
    const { call } = await connectTo(root, { git: new GitSync(root) });

    const created = parse(
      await call('ideas_create', { title: 'Git idea', author: 'claude' }),
    ) as Written;
    expect(created.git).toBe('Committed and pushed.');
    await call('ideas_append', { slug: 'git-idea', kind: 'log', text: 'Step.', author: 'claude' });
    expect(await git(remote, 'log', '--format=%s', 'main')).toBe(
      ['kaihuman: idea git-idea — log', 'kaihuman: idea git-idea — create', 'initial'].join('\n'),
    );
    expect(await git(root, 'status', '--porcelain')).toBe('');

    // Another device pushes an idea; a fresh server pulls it before listing.
    const other = await clone();
    await writeFile(join(other, '.kh/ideas/from-phone.md'), '# From phone\n');
    await git(other, 'add', '--all');
    await git(other, 'commit', '--quiet', '-m', 'phone');
    await git(other, 'push', '--quiet');
    await client?.close();
    const fresh = await connectTo(root, { git: new GitSync(root) });
    const slugs = (parse(await fresh.call('ideas_list')) as { slug: string }[]).map((i) => i.slug);
    expect(slugs).toContain('from-phone');
  });

  it('commits only the idea file, leaving other staged changes alone', async () => {
    const { root } = await makeGitRepo(IDEAS);
    await writeFile(join(root, 'staged.txt'), 'staged');
    await git(root, 'add', 'staged.txt');
    const { call } = await connectTo(root, { git: new GitSync(root) });
    await call('ideas_set_summary', { slug: 'palette-sync', summary: 'New summary.' });
    expect(await git(root, 'show', '--name-only', '--format=%s', 'HEAD')).toBe(
      `kaihuman: idea palette-sync — summary\n\n${PALETTE}`,
    );
    expect(await git(root, 'status', '--porcelain')).toBe('A  staged.txt');
  });

  it('reports a failed push but keeps the local commit', async () => {
    const { root, remote } = await makeGitRepo(IDEAS);
    await git(root, 'remote', 'set-url', 'origin', join(remote, 'missing.git'));
    const { call } = await connectTo(root, { git: new GitSync(root) });
    const result = parse(
      await call('ideas_set_status', {
        slug: 'palette-sync',
        status: 'committed',
        author: 'claude',
      }),
    ) as Written;
    expect(result.git).toMatch(/^Committed locally but not pushed: \S/);
    expect(result.git).not.toContain('\n');
    expect(await git(root, 'log', '-1', '--format=%s')).toBe(
      'kaihuman: idea palette-sync — status committed',
    );
  });

  it('pulls at most once a minute', async () => {
    const { root, clone } = await makeGitRepo(IDEAS);
    let now = 0;
    const sync = new GitSync(root, () => now);
    await sync.pull();
    const other = await clone();
    await writeFile(join(other, 'later.txt'), 'x');
    await git(other, 'add', '--all');
    await git(other, 'commit', '--quiet', '-m', 'later');
    await git(other, 'push', '--quiet');
    now = 59_999;
    await sync.pull();
    expect(await git(root, 'log', '-1', '--format=%s')).toBe('initial');
    now = 60_000;
    await sync.pull();
    expect(await git(root, 'log', '-1', '--format=%s')).toBe('later');
  });
});
