/**
 * The commands a `.commands.md` file holds, and filling in their parameters.
 *
 * The grammar is `.prompts.md`'s — one `## Title #tags` per entry — and the command is the entry's
 * first fenced code block, or its whole text when it has none. `$1`…`$9` are parameters asked for
 * in the palette; `\$1` is a literal `$1` (for awk and the like). See doc/commands-format.md; the
 * console's reading of the same file is packages/ui/src/LifeOS/Organisms/Widgets/CommandsLogic.ts.
 */
import { parsePrompts } from './prompts.js';

export interface Command {
  title: string;
  tags: string[];
  command: string;
  /** Whatever the entry says besides the command, when the command is in a code block. */
  note: string;
}

const FENCE = /```[^\n]*\n([\s\S]*?)\n?```/;
const PARAMETER = /(\\?)\$([1-9])/g;

export function parseCommands(content: string): Command[] {
  return parsePrompts(content)
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
}

/** How many values the command asks for: its highest `$n`, since `$2` alone still needs a `$1`. */
export function commandParameters(command: string): number {
  let highest = 0;
  for (const [, escaped, digit] of command.matchAll(PARAMETER)) {
    if (!escaped) highest = Math.max(highest, Number(digit));
  }
  return highest;
}

/** Each `$n` replaced by the n-th value as typed; each `\$n` becomes a plain `$n`. */
export function fillCommand(command: string, values: readonly string[]): string {
  return command.replace(PARAMETER, (_, escaped: string, digit: string) =>
    escaped ? `$${digit}` : (values[Number(digit) - 1] ?? ''),
  );
}
