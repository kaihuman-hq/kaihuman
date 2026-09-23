/**
 * Logic for the Commands Widget (.commands.md)
 *
 * The grammar is `.prompts.md`'s — one `## Title #tags` per entry — so reading and writing reuse
 * PromptsLogic. An entry's command is its first fenced code block, or its whole text when it has
 * none; `$1`…`$9` are parameters, and `\$1` is a literal `$1`. See doc/commands-format.md.
 *
 * The command palette reads the same file (packages/palette/src/commands.ts); keep the two in step.
 */
import { addPrompt, parsePrompts, serializePrompts } from './PromptsLogic';

export interface CommandEntry {
  title: string;
  tags: string[];
  command: string;
  /** Whatever the entry says besides the command, when the command is in a code block. */
  note: string;
}

const FENCE = /```[^\n]*\n([\s\S]*?)\n?```/;
const PARAMETER = /(\\?)\$([1-9])/g;

export const parseCommands = (content: string): CommandEntry[] =>
  parsePrompts(content)
    .map(({ title, tags, body }) => {
      const fenced = FENCE.exec(body);
      if (!fenced) return { title, tags, command: body.trim(), note: '' };
      return {
        title,
        tags,
        command: (fenced[1] ?? '').trim(),
        note: body.replace(fenced[0], '').trim(),
      };
    })
    .filter((entry) => entry.command);

/** How many values the command asks for: its highest `$n`, since `$2` alone still needs a `$1`. */
export const commandParameters = (command: string): number => {
  let highest = 0;
  for (const [, escaped, digit] of command.matchAll(PARAMETER)) {
    if (!escaped) highest = Math.max(highest, Number(digit));
  }
  return highest;
};

/** Each `$n` replaced by the n-th value as typed; each `\$n` becomes a plain `$n`. */
export const fillCommand = (command: string, values: readonly string[]): string =>
  command.replace(PARAMETER, (_, escaped: string, digit: string) =>
    escaped ? `$${digit}` : (values[Number(digit) - 1] ?? ''),
  );

/** Appends an entry, the command in a `sh` code block under its note; the file is rewritten whole. */
export const addCommand = (
  content: string,
  title: string,
  tags: string[],
  command: string,
  note = '',
): string => {
  const body = `${note.trim() ? `${note.trim()}\n\n` : ''}\`\`\`sh\n${command.trim()}\n\`\`\``;
  return serializePrompts(addPrompt(parsePrompts(content), title, tags, body)).replace(
    /^# Prompts\n/,
    '# Commands\n',
  );
};
