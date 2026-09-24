/**
 * Logic for the Commands Widget (.commands.md)
 *
 * The grammar is `.prompts.md`'s — one `## Title #tags` per entry — so reading and writing reuse
 * the prompts format. An entry's command is its first fenced code block, or its whole text when it has
 * none; `{{port}}` is a parameter, and every `$` is the shell's. See doc/commands-format.md.
 *
 * The console and both command palettes read and write the file through this module.
 */
import { addPrompt, parsePrompts, serializePrompts } from './prompts.js';

export interface CommandEntry {
  title: string;
  tags: string[];
  command: string;
  /** Whatever the entry says besides the command, when the command is in a code block. */
  note: string;
}

const FENCE = /```[^\n]*\n([\s\S]*?)\n?```/;
/** `{{port}}` or `{{ port }}` — a name, so Go templates like docker's `{{.Name}}` are left alone. */
const PARAMETER = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;

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

/** The parameters' names, each once, in the order they first appear. */
export const commandParameters = (command: string): string[] => [
  ...new Set(Array.from(command.matchAll(PARAMETER), ([, name]) => name ?? '')),
];

/** Each `{{name}}` replaced by its value as typed; one without a value stays as written. */
export const fillCommand = (command: string, values: Readonly<Record<string, string>>): string =>
  command.replace(PARAMETER, (placeholder, name: string) => values[name] ?? placeholder);

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
