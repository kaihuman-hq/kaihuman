/**
 * The commands a `.commands.md` file holds, and filling in their parameters.
 *
 * The grammar is `.prompts.md`'s — one `## Title #tags` per entry — and the command is the entry's
 * first fenced code block, or its whole text when it has none. `{{port}}` is a parameter, asked for
 * by name in the palette; every `$` is the shell's. See doc/commands-format.md; the console's
 * reading of the same file is packages/ui/src/LifeOS/Organisms/Widgets/CommandsLogic.ts.
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
/** `{{port}}` or `{{ port }}` — a name, so Go templates like docker's `{{.Name}}` are left alone. */
const PARAMETER = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;

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

/** The parameters' names, each once, in the order they first appear. */
export function commandParameters(command: string): string[] {
  return [...new Set(Array.from(command.matchAll(PARAMETER), ([, name]) => name ?? ''))];
}

/** Each `{{name}}` replaced by its value as typed; one without a value stays as written. */
export function fillCommand(command: string, values: Readonly<Record<string, string>>): string {
  return command.replace(PARAMETER, (placeholder, name: string) => values[name] ?? placeholder);
}
