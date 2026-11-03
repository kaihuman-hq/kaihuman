import {
  addIdeaChallenge,
  appendIdeaBraindump,
  applyIdeaHandoff,
  findIdeas,
  IDEA_STATUSES,
  type IdeaRef,
  type IdeaSlug,
  ideaActivity,
  logIdea,
  newIdea,
  OPEN_IDEA_STATUSES,
  parseIdeaHandoffs,
  setIdeaStatus,
  setIdeaSummary,
} from '@kaihuman/formats';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BusinessFiles } from './business.js';
import { registerBusinessTools } from './business-tools.js';
import type { GitSync } from './git.js';
import { IdeaFiles, requireSlug } from './ideas.js';
import { KbError, type KnowledgeBase } from './repo.js';
import { searchPages } from './search.js';

export const SERVER_NAME = 'kaihuman-kb';
export const SERVER_VERSION = '0.1.0';

const PAGE_TYPES = ['source', 'entity', 'concept', 'topic', 'question'] as const;
const TAG = z
  .string()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _./-]*$/u, 'Tags may contain letters, digits, space, _ . / -')
  .max(50);

const IDEA_TAG = z
  .string()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}_./-]{0,49}$/u, 'Tags may contain letters, digits, _ . / -');
// The slug is checked with asIdeaSlug in the handler; the cap only bounds the input.
const SLUG = z.string().trim().min(1).max(100);
// Mirrors the library's author rule, so kinds that write no log entry reject bad names too.
const AUTHOR = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9.-]{0,30}$/, 'Use lowercase letters, digits, "." or "-", such as claude')
  .describe('Your short lowercase name: claude, gemini, codex… The user is "human".');

const IDEA_RULES =
  'Noise rules: one log entry per meaningful step, not per message; the summary is the only part that is rewritten; never rewrite the log, challenges or braindump.';

export interface KbServerOptions {
  /** Pull before ideas tools run, and commit and push each ideas write. */
  git?: GitSync;
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Registers the knowledge-base tools on a fresh MCP server bound to one repository. */
export function createKbServer(kb: KnowledgeBase, options: KbServerOptions = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const ideas = new IdeaFiles(kb);
  const { git } = options;

  const row = ({ slug, idea }: IdeaRef, now: Date) => {
    const { level, recent, total } = ideaActivity(idea, now);
    return {
      slug,
      title: idea.title,
      status: idea.status,
      product: idea.product,
      tags: idea.tags,
      updated: idea.updated,
      activity: { level, recent, total },
      openChallenges: idea.challenges.filter((c) => !c.done).length,
      lastLog: idea.log[0] ?? null,
    };
  };

  // Ideas and business tools run one at a time: a client may send calls concurrently, and each
  // edit is a read-modify-write of a file followed by git commands that would collide on the
  // index lock.
  let queue: Promise<unknown> = Promise.resolve();
  const queued =
    <A>(handler: (args: A) => Promise<CallToolResult>) =>
    (args: A): Promise<CallToolResult> => {
      const result = queue.then(async () => {
        await git?.pull();
        return handler(args);
      });
      queue = result.catch(() => undefined);
      return result;
    };
  const ideasTool = queued;

  /** Commits the written paths when git sync is on, and says what happened to them. */
  const commitPaths = async (paths: string[], message: string) =>
    git
      ? git.commit(paths, message)
      : 'Written but not committed: git sync is off (start the server with --git).';

  /** Commits the written ideas when git sync is on, and says what happened to them. */
  const saved = async (slugs: IdeaSlug[], op: string) => {
    const paths = slugs.map((slug) => ideas.path(slug));
    const message = `kaihuman: idea ${slugs.join(', ')} — ${op}`;
    return commitPaths(paths, message);
  };

  /** Reads an idea, applies one edit and writes it back. */
  const edit = async (value: string, op: string, change: (text: string, now: Date) => string) => {
    const slug = requireSlug(value);
    const { path, text } = await ideas.read(slug);
    await ideas.update(slug, change(text, new Date()));
    return json({ slug, path, git: await saved([slug], op) });
  };

  server.registerTool(
    'kb_search',
    {
      title: 'Search knowledge base',
      description:
        'Rank wiki pages for a query using the prebuilt search.kb.json index (if present) plus full-text scoring over title, tags and body. Returns file, title, type, tags, score and a snippet.',
      inputSchema: {
        query: z.string().trim().min(1).max(500),
        limit: z.number().int().min(1).max(50).default(5),
      },
    },
    async ({ query, limit }) => {
      const [pages, index] = await Promise.all([kb.listPages(), kb.readSearchIndex()]);
      return json(searchPages(pages, query, limit, index));
    },
  );

  server.registerTool(
    'kb_read',
    {
      title: 'Read wiki page',
      description:
        'Read a wiki page by filename, slug or title (case-insensitive). Returns the full markdown plus backlinks (pages linking to it via [[...]]).',
      inputSchema: { page: z.string().trim().min(1).max(300) },
    },
    async ({ page: ref }) => {
      const { page, backlinks } = await kb.readPage(ref);
      return json({
        file: page.file,
        title: page.title,
        type: page.type,
        tags: page.tags,
        content: page.content,
        backlinks,
      });
    },
  );

  server.registerTool(
    'kb_list',
    {
      title: 'List wiki pages',
      description: 'List wiki pages with title, type, tags and updated date, optionally filtered.',
      inputSchema: {
        type: z.enum(PAGE_TYPES).optional(),
        tag: z.string().trim().min(1).max(50).optional(),
      },
    },
    async ({ type, tag }) => {
      const wantedTag = tag?.toLowerCase();
      const pages = (await kb.listPages())
        .filter((p) => !type || p.type === type)
        .filter((p) => !wantedTag || p.tags.some((t) => t.toLowerCase() === wantedTag))
        .map(({ file, title, type, tags, updated }) => ({ file, title, type, tags, updated }));
      return json(pages);
    },
  );

  server.registerTool(
    'kb_index',
    {
      title: 'Read knowledge base index',
      description: 'Return the content of the index.kb.md catalog.',
    },
    async () => ({ content: [{ type: 'text', text: await kb.readIndex() }] }),
  );

  server.registerTool(
    'kb_log',
    {
      title: 'Read knowledge base log',
      description: 'Return parsed log.md entries (date, op, title, body), newest first.',
      inputSchema: { limit: z.number().int().min(1).max(500).default(20) },
    },
    async ({ limit }) => json((await kb.readLog()).slice(0, limit)),
  );

  server.registerTool(
    'kb_add_raw',
    {
      title: 'Add raw source',
      description:
        'Save a new unprocessed source to raw/ (processed: false) for a later /kb-ingest run. Returns the repo-relative path written.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        text: z.string().min(1).max(1_000_000),
        url: z.url().max(2000).optional(),
        tags: z.array(TAG).max(20).optional(),
      },
    },
    async (note) => json({ path: await kb.addRaw(note) }),
  );

  server.registerTool(
    'ideas_list',
    {
      title: 'List ideas',
      description:
        'Overview of the product and feature ideas in ideas/<slug>.md, most recently active first: slug, title, status, product, tags, activity, open challenge count and newest log entry. Closed ideas (shipped, parked, dropped) are left out unless includeClosed is true or status asks for them.',
      inputSchema: {
        status: z.enum(IDEA_STATUSES).optional(),
        product: z.string().trim().min(1).max(100).optional(),
        includeClosed: z.boolean().default(false),
      },
    },
    ideasTool(async ({ status, product, includeClosed }) => {
      const now = new Date();
      const wantedProduct = product?.toLowerCase();
      const rows = (await ideas.list())
        .filter(({ idea }) =>
          status
            ? idea.status === status
            : includeClosed || OPEN_IDEA_STATUSES.includes(idea.status),
        )
        .filter(({ idea }) => !wantedProduct || idea.product?.toLowerCase() === wantedProduct)
        .map((ref) => ({ ref, lastAt: ideaActivity(ref.idea, now).lastAt ?? 0 }))
        .sort((a, b) => b.lastAt - a.lastAt || a.ref.slug.localeCompare(b.ref.slug))
        .map(({ ref }) => row(ref, now));
      return json(rows);
    }),
  );

  server.registerTool(
    'ideas_find',
    {
      title: 'Find ideas',
      description:
        'Find ideas matching a few words (slug, title, product, tags), best first, at most 10. Use it to resolve "the palette idea" to a slug. One clear match: use it and say which; several: ask the user.',
      inputSchema: { query: z.string().trim().min(1).max(200) },
    },
    ideasTool(async ({ query }) => {
      const now = new Date();
      return json(
        findIdeas(await ideas.list(), query)
          .slice(0, 10)
          .map((ref) => row(ref, now)),
      );
    }),
  );

  server.registerTool(
    'ideas_read',
    {
      title: 'Read idea',
      description:
        'Read one idea by slug: the whole markdown file plus its parsed fields (title, status, summary, log newest first, challenges, braindump). Read it before changing the summary or status.',
      inputSchema: { slug: SLUG },
    },
    ideasTool(async ({ slug }) => {
      const { path, text, idea } = await ideas.read(requireSlug(slug));
      return json({ slug, path, content: text, ...idea, activity: ideaActivity(idea, new Date()) });
    }),
  );

  server.registerTool(
    'ideas_create',
    {
      title: 'Create idea',
      description: `Create a new idea file with status seed and a first log entry. Fails if the slug exists. The slug (2–40 of a-z, 0-9, -) defaults to one made from the title and never changes. Put the user's own words in braindump, quoted, not rewritten. ${IDEA_RULES}`,
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        slug: SLUG.optional(),
        product: z.string().trim().min(1).max(100).optional(),
        tags: z.array(IDEA_TAG).max(20).optional(),
        summary: z.string().trim().min(1).max(2000).optional(),
        braindump: z.string().trim().min(1).max(100_000).optional(),
        author: AUTHOR,
      },
    },
    ideasTool(async ({ author, slug, ...input }) => {
      const created = newIdea(
        { ...input, ...(slug === undefined ? {} : { slug: requireSlug(slug) }) },
        { author, now: new Date() },
      );
      await ideas.create(created.slug, created.content);
      return json({
        slug: created.slug,
        path: ideas.path(created.slug),
        git: await saved([created.slug], 'create'),
      });
    }),
  );

  server.registerTool(
    'ideas_append',
    {
      title: 'Add to idea',
      description: `Add to an idea. kind "log": a finding, decision or result, one or two sentences, added at the top of the log. kind "challenge": a risk or open question. kind "braindump": the user's own words, quoted, appended at the end. No log entry for "discussed the idea". ${IDEA_RULES}`,
      inputSchema: {
        slug: SLUG,
        kind: z.enum(['log', 'challenge', 'braindump']),
        text: z.string().trim().min(1).max(20_000),
        author: AUTHOR,
      },
    },
    ideasTool(async ({ slug, kind, text, author }) => {
      if (kind !== 'braindump' && text.length > 1000) {
        throw new KbError(`A ${kind} entry is at most 1000 characters; keep it to two sentences.`);
      }
      return edit(slug, kind, (content, now) => {
        if (kind === 'log') return logIdea(content, text, { author, now });
        if (kind === 'challenge') return addIdeaChallenge(content, text, { now });
        return appendIdeaBraindump(content, text, { now });
      });
    }),
  );

  server.registerTool(
    'ideas_set_summary',
    {
      title: 'Set idea summary',
      description:
        'Replace the summary under the title (at most 3 sentences on where the idea stands now). The summary is the only part of an idea that is rewritten; use it when the understanding of the idea changed.',
      inputSchema: { slug: SLUG, summary: z.string().trim().min(1).max(2000) },
    },
    ideasTool(async ({ slug, summary }) =>
      edit(slug, 'summary', (content, now) => setIdeaSummary(content, summary, { now })),
    ),
  );

  server.registerTool(
    'ideas_set_status',
    {
      title: 'Set idea status',
      description:
        "Change an idea's status (seed → exploring → committed → shipped, or parked / dropped) and log the change. Always give a reason when parking or dropping.",
      inputSchema: {
        slug: SLUG,
        status: z.enum(IDEA_STATUSES),
        reason: z.string().trim().min(1).max(1000).optional(),
        author: AUTHOR,
      },
    },
    ideasTool(async ({ slug, status, reason, author }) =>
      edit(slug, `status ${status}`, (content, now) =>
        setIdeaStatus(content, status, { author, now, ...(reason ? { reason } : {}) }),
      ),
    ),
  );

  server.registerTool(
    'ideas_import',
    {
      title: 'Import idea hand-offs',
      description:
        'Apply every ```kh-idea hand-off block in a pasted text (from a chat that could not write files): updates existing ideas by slug, creates new ones (slug: new plus title). Nothing is written if any block fails.',
      inputSchema: { text: z.string().min(1).max(200_000), author: AUTHOR },
    },
    ideasTool(async ({ text, author }) => {
      const handoffs = parseIdeaHandoffs(text);
      if (!handoffs.length) throw new KbError('The text has no ```kh-idea block.');
      const now = new Date();
      // Planned first, so a bad block leaves every file untouched; later blocks see earlier ones.
      const planned = new Map<IdeaSlug, { content: string; created: boolean }>();
      const current = async (slug: IdeaSlug) =>
        planned.get(slug)?.content ?? (await ideas.find(slug))?.text ?? null;
      for (const handoff of handoffs) {
        const slug = handoff.slug === undefined ? null : requireSlug(handoff.slug);
        const existing = slug ? await current(slug) : null;
        const result = applyIdeaHandoff(existing, handoff, { author, now });
        if (existing === null && (await current(result.slug)) !== null) {
          throw new KbError(`Idea "${result.slug}" already exists; give its slug to update it.`);
        }
        planned.set(result.slug, {
          content: result.content,
          created: planned.get(result.slug)?.created ?? existing === null,
        });
      }
      for (const [slug, { content, created }] of planned) {
        await (created ? ideas.create(slug, content) : ideas.update(slug, content));
      }
      const slugs = [...planned.keys()];
      return json({
        ideas: [...planned].map(([slug, { created }]) => ({
          slug,
          path: ideas.path(slug),
          action: created ? 'created' : 'updated',
        })),
        git: await saved(slugs, 'import'),
      });
    }),
  );

  registerBusinessTools(server, {
    files: new BusinessFiles(kb),
    run: queued,
    commit: commitPaths,
  });

  return server;
}
