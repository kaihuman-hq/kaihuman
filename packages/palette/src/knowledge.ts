/**
 * Knowledge captures: each one becomes its own `.kh/raw/<epoch>-<slug>.md` file, as `cli capture`,
 * the console's Quick knowledge page and the extension's clippings write them, so `/kb-ingest`
 * picks it up with the rest.
 */

export const KNOWLEDGE_INBOX = '.kh/raw';

/** A capture's own file, directly in the inbox — the only place backends let `CAPTURE_KNOWLEDGE` write. */
export const isKnowledgePath = (path: string) => /^\.kh\/raw\/[a-z0-9][a-z0-9-]*\.md$/.test(path);

const slugOf = (line: string) =>
  line
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
    .replace(/-+$/, '') || 'note';

/**
 * The file for `text`: its first non-empty line is the title and names the file, the whole text
 * is the body. Fails on blank text, so nothing empty reaches the inbox.
 */
export const knowledgeNote = (text: string, now: Date): { path: string; content: string } => {
  const body = text.trim();
  if (!body) throw new Error('Nothing to capture');
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  const title = firstLine.slice(0, 80).replace(/"/g, '\\"');
  const date = now.toISOString().slice(0, 10);
  return {
    path: `${KNOWLEDGE_INBOX}/${now.getTime()}-${slugOf(firstLine)}.md`,
    content: `---\ntitle: "${title}"\nurl: ''\ndate: ${date}\nprocessed: false\ntags: [general]\n---\n\n${body}\n`,
  };
};
