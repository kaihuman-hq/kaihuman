/**
 * Logic for the Prompts Widget (.prompts.md)
 *
 * One H2 section per prompt, tags inline on the heading line:
 *
 *   # Prompts
 *
 *   ## Refactor to hooks #react #refactor
 *
 *   Convert the class component below into a function component using hooks.
 *   Keep the public props identical.
 *
 *   ## Commit message #git
 *
 *   Write a conventional-commit message for the staged diff.
 *
 * Rules:
 *   1. A prompt starts at a line matching `## ` at column 0.
 *   2. Tags are `#tag` tokens on that heading line; what remains is the title.
 *   3. The body runs to the next `## ` heading or to the end of the file.
 *
 * The format stays grep-able on purpose, so anything that can read the raw file
 * can search it without an index: `grep -n '^## ' x.prompts.md` lists every
 * prompt with its title, tags and line number in a single pass.
 */

export interface Prompt {
  title: string;
  tags: string[];
  body: string;
}

const HEADING = /^## /;

/**
 * A body line opening with `## ` would otherwise read as the next prompt, so it
 * is written with a leading backslash — a markdown escape, which renders as a
 * literal `## `. Already-escaped lines gain one more backslash so the round trip
 * stays lossless.
 */
const escapeBodyLine = (line: string): string => line.replace(/^(\\*)(## )/, '\\$1$2');

const unescapeBodyLine = (line: string): string => line.replace(/^\\(\\*## )/, '$1');

/** Drop blank lines at both ends, preserving indentation on the lines that remain. */
const trimBlankEdges = (lines: string[]): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && !(lines[start] ?? '').trim()) start++;
  while (end > start && !(lines[end - 1] ?? '').trim()) end--;
  return lines.slice(start, end);
};

const normalizeBody = (body: string): string =>
  trimBlankEdges(body.split('\n').map((line) => line.replace(/\r$/, ''))).join('\n');

/** Pull `#tag` tokens out of a heading, returning the bare title and the tags. */
const splitHeading = (heading: string): { title: string; tags: string[] } => {
  const tags: string[] = [];
  const title = heading
    .replace(/#([\w-]+)/g, (_, tag: string) => {
      tags.push(tag);
      return '';
    })
    .trim();
  return { title, tags };
};

export const parsePrompts = (content: string): Prompt[] => {
  if (!content) return [];

  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  const prompts: Prompt[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!HEADING.test(line)) continue;

    const { title, tags } = splitHeading(line.slice(3));

    const body: string[] = [];
    while (i + 1 < lines.length && !HEADING.test(lines[i + 1] ?? '')) {
      i++;
      body.push(unescapeBodyLine(lines[i] ?? ''));
    }

    prompts.push({ title, tags, body: trimBlankEdges(body).join('\n') });
  }

  return prompts;
};

export const serializePrompts = (prompts: Prompt[]): string => {
  let result = '# Prompts\n';

  for (const prompt of prompts) {
    const tagStr = prompt.tags.map((t) => `#${t}`).join(' ');
    result += `\n## ${prompt.title}${tagStr ? ` ${tagStr}` : ''}\n\n`;

    const body = trimBlankEdges(prompt.body.split('\n')).map(escapeBodyLine).join('\n');
    if (body) result += `${body}\n`;
  }

  return result;
};

export const addPrompt = (
  prompts: Prompt[],
  title: string,
  tags: string[],
  body: string,
): Prompt[] => {
  // Tags typed straight into the title are merged with the ones picked in the
  // form, so a title never carries a `#tag` through to the file twice.
  const { title: cleanTitle, tags: inlineTags } = splitHeading(title);

  return [
    ...prompts,
    {
      title: cleanTitle,
      tags: [...new Set([...tags, ...inlineTags])],
      body: normalizeBody(body),
    },
  ];
};
