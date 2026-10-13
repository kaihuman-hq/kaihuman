import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addIdeaChallenge,
  appendIdeaBraindump,
  applyIdeaHandoff,
  asIdeaSlug,
  findIdeas,
  type IdeaSlug,
  ideaActivity,
  ideaLogTime,
  ideaPath,
  ideaSlugOf,
  ideaTimestamp,
  logIdea,
  newIdea,
  parseIdea,
  parseIdeaHandoffs,
  setIdeaStatus,
  setIdeaSummary,
  slugifyIdeaTitle,
} from './ideas.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/ideas/${name}`, import.meta.url), 'utf8');

const SAMPLE = fixture('palette-sync.md');
const now = new Date(2026, 9, 15, 8, 5);
const edit = { now, author: 'claude' };

describe('idea paths', () => {
  it('names an idea by its slug and reads the slug back', () => {
    const path = ideaPath('palette-sync' as IdeaSlug);
    expect(path).toBe('.kh/ideas/palette-sync.md');
    expect(ideaSlugOf(path)).toBe('palette-sync');
  });

  it('refuses every other path', () => {
    for (const path of [
      '.kh/ideas/../dump.md',
      '.kh/ideas/Palette.md',
      '.kh/ideas/a.md',
      '.kh/ideas/-x.md',
      '.kh/ideas/x.txt',
      '.kh/ideas/archive/old-idea.md',
      `.kh/ideas/${'a'.repeat(41)}.md`,
      '.kh/raw/palette-sync.md',
      '/.kh/ideas/palette-sync.md',
      '.kh/ideas/palette-sync.md\n',
    ]) {
      expect(ideaSlugOf(path), path).toBeNull();
    }
  });

  it('checks slugs', () => {
    expect(asIdeaSlug('ok')).toBe('ok');
    expect(asIdeaSlug('a')).toBeNull();
    expect(asIdeaSlug('Has Space')).toBeNull();
  });
});

describe('slugifyIdeaTitle', () => {
  it('joins words with dashes and drops accents', () => {
    expect(slugifyIdeaTitle('Offline sync: the Désktop palette!')).toBe(
      'offline-sync-the-desktop-palette',
    );
  });

  it('cuts at a word end within 40 characters', () => {
    const slug = slugifyIdeaTitle('one two three four five six seven eight nine ten eleven');
    expect(slug).toBe('one-two-three-four-five-six-seven-eight');
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('falls back to "idea" when nothing usable is left', () => {
    expect(slugifyIdeaTitle('!!!')).toBe('idea');
    expect(slugifyIdeaTitle('x')).toBe('idea');
  });
});

describe('timestamps', () => {
  it('formats log time and ISO time with offset in local time', () => {
    expect(ideaLogTime(now)).toBe('2026-10-15 08:05');
    expect(ideaTimestamp(now)).toMatch(/^2026-10-15T08:05[+-]\d{2}:\d{2}$/);
    expect(Date.parse(ideaTimestamp(now))).toBe(now.getTime());
  });
});

describe('parseIdea', () => {
  it('reads the shared fixture', () => {
    expect(parseIdea(SAMPLE)).toEqual(JSON.parse(fixture('palette-sync.json')));
  });

  it('is lenient with hand-written files', () => {
    const idea = parseIdea('# Just a title\n\nSome words.\n');
    expect(idea).toMatchObject({
      title: 'Just a title',
      status: 'seed',
      summary: 'Some words.',
      log: [],
      tags: [],
    });
    expect(parseIdea('---\nstatus: wild\n---\n').status).toBe('seed');
  });
});

describe('newIdea', () => {
  it('writes frontmatter, title, the first log entry and the braindump', () => {
    const { slug, path, content } = newIdea(
      {
        title: 'Voice capture: on Android',
        product: 'kaihuman',
        tags: ['mobile'],
        braindump: 'hold a key\nand talk',
      },
      { now, author: 'human' },
    );
    expect(slug).toBe('voice-capture-on-android');
    expect(path).toBe('.kh/ideas/voice-capture-on-android.md');
    const stamp = ideaTimestamp(now);
    expect(content).toBe(
      [
        '---',
        'title: "Voice capture: on Android"',
        'status: seed',
        'product: kaihuman',
        'tags: [mobile]',
        `created: ${stamp}`,
        `updated: ${stamp}`,
        '---',
        '',
        '# Voice capture: on Android',
        '',
        '## Log',
        '',
        '- 2026-10-15 08:05 · human · Created.',
        '',
        '## Braindump',
        '',
        'hold a key',
        'and talk',
        '',
      ].join('\n'),
    );
    expect(parseIdea(content).title).toBe('Voice capture: on Android');
  });

  it('refuses a bad slug, tag or author', () => {
    expect(() => newIdea({ title: 'x', slug: 'Bad Slug' }, edit)).toThrow(/not a slug/);
    expect(() => newIdea({ title: 'x', tags: ['a,b'] }, edit)).toThrow(/not a tag/);
    expect(() => newIdea({ title: 'x' }, { now, author: 'Claude Code' })).toThrow(/author/);
    expect(() => newIdea({ title: '  ' }, edit)).toThrow(/empty/);
  });
});

describe('edits', () => {
  it('adds a log entry at the top and touches updated', () => {
    const next = logIdea(SAMPLE, 'Tried a queue.\nIt works.', edit);
    const idea = parseIdea(next);
    expect(idea.log[0]).toEqual({
      at: '2026-10-15 08:05',
      author: 'claude',
      text: 'Tried a queue. It works.',
    });
    expect(idea.log).toHaveLength(4);
    expect(idea.updated).toBe(ideaTimestamp(now));
    // Everything it does not own stays as it was.
    expect(idea.braindump).toBe(parseIdea(SAMPLE).braindump);
    expect(next.split('## Challenges')[1]).toBe(SAMPLE.split('## Challenges')[1]);
  });

  it('creates the log after the summary when there is none', () => {
    const next = logIdea('# T\n\nSummary.\n\n## Braindump\n\nraw\n', 'First.', edit);
    expect(next).toContain(
      'Summary.\n\n## Log\n\n- 2026-10-15 08:05 · claude · First.\n\n## Braindump',
    );
  });

  it('adds a challenge at the end of the list, before the braindump if new', () => {
    expect(parseIdea(addIdeaChallenge(SAMPLE, 'Battery?', { now })).challenges.at(-1)).toEqual({
      done: false,
      text: 'Battery?',
    });
    const fresh = addIdeaChallenge('# T\n\n## Braindump\n\nraw\n', 'Why?', { now });
    expect(fresh.indexOf('## Challenges')).toBeLessThan(fresh.indexOf('## Braindump'));
  });

  it('appends to the braindump without changing what is there', () => {
    const idea = parseIdea(appendIdeaBraindump(SAMPLE, 'And sync on wake.', { now }));
    expect(idea.braindump).toBe(`${parseIdea(SAMPLE).braindump}\n\nAnd sync on wake.`);
    expect(appendIdeaBraindump('# T\n', 'raw', { now })).toMatch(/## Braindump\n\nraw\n$/);
  });

  it('replaces only the summary', () => {
    const next = setIdeaSummary(SAMPLE, 'Queue writes; no CRDT.', { now });
    expect(parseIdea(next).summary).toBe('Queue writes; no CRDT.');
    expect(parseIdea(next).log).toEqual(parseIdea(SAMPLE).log);
  });

  it('changes the status and logs it', () => {
    const next = setIdeaStatus(SAMPLE, 'committed', { ...edit, reason: 'Small enough.' });
    const idea = parseIdea(next);
    expect(idea.status).toBe('committed');
    expect(idea.log[0]?.text).toBe('Status exploring → committed. Small enough.');
    expect(() => setIdeaStatus(SAMPLE, 'exploring', edit)).toThrow(/already/);
  });
});

describe('ideaActivity', () => {
  it('counts recent log entries and grades the last one', () => {
    const activity = ideaActivity(parseIdea(SAMPLE), new Date(2026, 9, 20));
    expect(activity.total).toBe(3);
    expect(activity.recent).toBe(3);
    expect(activity.level).toBe('hot');
    expect(ideaActivity(parseIdea(SAMPLE), new Date(2026, 10, 1)).level).toBe('warm');
    expect(ideaActivity(parseIdea(SAMPLE), new Date(2026, 11, 1)).level).toBe('cool');
    expect(ideaActivity(parseIdea(SAMPLE), new Date(2027, 6, 1))).toMatchObject({
      level: 'dormant',
      recent: 0,
    });
  });

  it('is dormant with no dates at all', () => {
    expect(ideaActivity(parseIdea('# T\n'), now)).toEqual({
      lastAt: null,
      recent: 0,
      total: 0,
      level: 'dormant',
    });
  });
});

describe('hand-off', () => {
  const pasted = [
    'Here is the summary of our chat:',
    '',
    '```kh-idea',
    'slug: new',
    'title: Ideas tools in kb-mcp',
    'product: kaihuman',
    'tags: [mcp, ideas]',
    'log: Compared CLI vs MCP; MCP for Claude Desktop.',
    'challenges:',
    '  - Needs the clone to be fresh',
    '  - Who pushes?',
    'summary: |',
    '  Claude Desktop reads and writes ideas',
    '  through kb-mcp.',
    '```',
  ].join('\n');

  it('reads every block', () => {
    expect(parseIdeaHandoffs(pasted)).toEqual([
      {
        title: 'Ideas tools in kb-mcp',
        product: 'kaihuman',
        tags: ['mcp', 'ideas'],
        log: 'Compared CLI vs MCP; MCP for Claude Desktop.',
        challenges: ['Needs the clone to be fresh', 'Who pushes?'],
        summary: 'Claude Desktop reads and writes ideas\nthrough kb-mcp.',
      },
    ]);
    expect(parseIdeaHandoffs('no block here')).toEqual([]);
    expect(parseIdeaHandoffs('title: Bare')).toEqual([{ title: 'Bare', tags: [], challenges: [] }]);
  });

  it('creates a new idea from a hand-off', () => {
    const [handoff] = parseIdeaHandoffs(pasted);
    if (!handoff) throw new Error('no hand-off');
    const { slug, content } = applyIdeaHandoff(null, handoff, { now, author: 'claude.ai' });
    expect(slug).toBe('ideas-tools-in-kb-mcp');
    const idea = parseIdea(content);
    expect(idea.log).toEqual([
      {
        at: '2026-10-15 08:05',
        author: 'claude.ai',
        text: 'Compared CLI vs MCP; MCP for Claude Desktop.',
      },
    ]);
    expect(idea.challenges.map((c) => c.text)).toEqual([
      'Needs the clone to be fresh',
      'Who pushes?',
    ]);
    expect(idea.summary).toBe('Claude Desktop reads and writes ideas\nthrough kb-mcp.');
  });

  it('updates an existing idea and refuses a no-op', () => {
    const next = applyIdeaHandoff(
      SAMPLE,
      { slug: 'palette-sync', status: 'parked', log: 'Not now.', tags: [], challenges: [] },
      { now, author: 'gemini' },
    );
    const idea = parseIdea(next.content);
    expect(idea.status).toBe('parked');
    expect(idea.log.slice(0, 2).map((e) => e.text)).toEqual([
      'Not now.',
      'Status exploring → parked.',
    ]);
    expect(() =>
      applyIdeaHandoff(SAMPLE, { slug: 'palette-sync', tags: [], challenges: [] }, edit),
    ).toThrow(/changes nothing/);
    expect(() => applyIdeaHandoff(SAMPLE, { tags: [], challenges: [] }, edit)).toThrow(/slug/);
  });

  it('refuses an unknown status', () => {
    expect(() => parseIdeaHandoffs('```kh-idea\nstatus: done\n```')).toThrow(/status/);
  });
});

describe('findIdeas', () => {
  const ideas = [
    { slug: 'palette-sync' as IdeaSlug, idea: parseIdea(SAMPLE) },
    { slug: 'voice-capture' as IdeaSlug, idea: parseIdea('# Voice capture on Android\n') },
    { slug: 'sync' as IdeaSlug, idea: parseIdea('# Something\n') },
  ];

  it('puts an exact slug first, then ideas that match every word', () => {
    expect(findIdeas(ideas, 'sync').map((r) => r.slug)).toEqual(['sync', 'palette-sync']);
    expect(findIdeas(ideas, 'offline palette').map((r) => r.slug)).toEqual(['palette-sync']);
    expect(findIdeas(ideas, 'android voice').map((r) => r.slug)).toEqual(['voice-capture']);
    expect(findIdeas(ideas, '  ')).toEqual([]);
  });
});
