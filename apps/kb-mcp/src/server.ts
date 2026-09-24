import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { KnowledgeBase } from './repo.js';
import { searchPages } from './search.js';

export const SERVER_NAME = 'lifosy-kb';
export const SERVER_VERSION = '0.1.0';

const PAGE_TYPES = ['source', 'entity', 'concept', 'topic', 'question'] as const;
const TAG = z
  .string()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _./-]*$/u, 'Tags may contain letters, digits, space, _ . / -')
  .max(50);

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Registers the knowledge-base tools on a fresh MCP server bound to one repository. */
export function createKbServer(kb: KnowledgeBase): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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

  return server;
}
