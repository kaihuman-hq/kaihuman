/**
 * Adding one entry to a file the console shows as a widget — a todo to a `.todos.md`, an event to
 * an `.events.csv` — written the way that widget's Add form writes it, so the console reads it
 * back as its own. The widgets' formats live in packages/ui/src/LifeOS/Organisms/Widgets.
 *
 * Each change only appends, so whatever else the file holds is kept as it is.
 */
import type { PromptStep } from './command-palette.js';

export interface EntryKind {
  suffix: string;
  /** One entry with its article, as the Add action names it: “Add a todo…”, “Add an event…”. */
  entry: string;
  /** Asked in order; `add` receives the answers in the same order. */
  prompts: PromptStep[];
  /** The file with the entry added; throws a message to show when the answers do not fit. */
  add: (content: string, answers: string[], now: Date) => string;
}

const TAG = /#[\w-]+/g;

const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-09-24`, in local time. */
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `2026-09-24 10:30:05`, in local time — an action log's timestamp. */
const localStamp = (date: Date) =>
  `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** Text with its `#tags` taken out, and the tags as typed. */
const splitHashTags = (input: string) => ({
  text: input.replace(TAG, '').replace(/\s+/g, ' ').trim(),
  tags: input.match(TAG) ?? [],
});

const appendLines = (content: string, lines: string) =>
  !content ? lines : `${content.endsWith('\n') ? content : `${content}\n`}${lines}`;

/**
 * Appends a backlog todo in the console's own format. `#tags` typed into the text are moved to the
 * end, where the console writes them.
 */
export function appendTodo(content: string, input: string, created: string): string {
  const { text, tags } = splitHashTags(input);
  if (!text) throw new Error('Nothing to add');
  return appendLines(
    content,
    `- [ ] ${text}${tags.length ? ` ${tags.join(' ')}` : ''}\n::created:: ${created}\n`,
  );
}

/** `- 2026-09-24 10:30:05 description #tag`, at the bottom, as the Action Log widget adds it. */
export function appendActionLog(content: string, input: string, now: Date): string {
  const { text, tags } = splitHashTags(input);
  if (!text) throw new Error('Nothing to add');
  const line = `- ${localStamp(now)} ${text}${tags.length ? ` ${tags.join(' ')}` : ''}`;
  return appendLines(content, `${line}\n`);
}

const EVENTS_HEADER = 'name;type;start iso date;end iso date';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One `name;type;start;end` row. A birthday is one day, as the Events widget's form makes it, and
 * an empty end date means the event ends the day it starts.
 */
export function appendEvent(
  content: string,
  [name = '', type = '', start = '', end = '']: string[],
): string {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('An event needs a name');
  // The file is `;`-separated with no quoting, so a `;` would split the name into columns.
  if (cleanName.includes(';')) throw new Error('An event name cannot contain “;”');
  const cleanType = type.trim().toLowerCase() || 'general';
  if (!/^[\w-]+$/.test(cleanType))
    throw new Error('The type is one word, like general or birthday');
  const startDate = start.trim();
  if (!ISO_DATE.test(startDate)) throw new Error('The start date is YYYY-MM-DD');
  const endDate = cleanType === 'birthday' ? startDate : end.trim() || startDate;
  if (!ISO_DATE.test(endDate)) throw new Error('The end date is YYYY-MM-DD');
  if (endDate < startDate) throw new Error('The event ends before it starts');
  const row = `${cleanName};${cleanType};${startDate};${endDate}\n`;
  return appendLines(content.trim() ? content : `${EVENTS_HEADER}\n`, row);
}

/** A body line opening with `## ` would read as the next entry, so it gets a backslash in front. */
const escapeBodyLine = (line: string) => line.replace(/^(\\*)(## )/, '\\$1$2');

/** A `## Title #tags` section at the end, as the Prompts and Commands widgets add one. */
const appendSection = (content: string, heading: string, title: string, body: string) => {
  const { text, tags } = splitHashTags(title);
  if (!text) throw new Error('It needs a title');
  if (!body.trim()) throw new Error('Nothing to add');
  const section = `## ${text}${tags.length ? ` ${tags.join(' ')}` : ''}\n\n${body}\n`;
  // A blank line before the heading, as the widgets serialize it.
  return appendLines(content.trim() ? content : `# ${heading}\n`, `\n${section}`);
};

export const appendPrompt = (content: string, [title = '', body = '']: string[]) =>
  appendSection(content, 'Prompts', title, escapeBodyLine(body.trim()));

/** The command in a `sh` code block, which is where the palette's `>x` reads it from. */
export const appendCommand = (content: string, [title = '', command = '']: string[]) =>
  appendSection(
    content,
    'Commands',
    title,
    command.trim() && `\`\`\`sh\n${command.trim()}\n\`\`\``,
  );

/**
 * The files the palette can add to. The desktop's backend keeps the same suffixes
 * (`ENTRY_SUFFIXES` in apps/desktop-palette/src-tauri/src/entries.rs) and writes no other files.
 */
export const ENTRY_KINDS: readonly EntryKind[] = [
  {
    suffix: '.todos.md',
    entry: 'a todo',
    prompts: [{ label: 'What needs to be done? #tags' }],
    add: (content, [input = ''], now) => appendTodo(content, input, now.toISOString()),
  },
  {
    suffix: '.actionlog.md',
    entry: 'an action',
    prompts: [{ label: 'What happened? #tags' }],
    add: (content, [input = ''], now) => appendActionLog(content, input, now),
  },
  {
    suffix: '.events.csv',
    entry: 'an event',
    prompts: [
      { label: 'Name' },
      { label: 'Type — general or birthday', initial: () => 'general' },
      { label: 'Start date (YYYY-MM-DD)', initial: () => localDate(new Date()) },
      { label: 'End date (YYYY-MM-DD) — empty for one day' },
    ],
    add: (content, answers) => appendEvent(content, answers),
  },
  {
    suffix: '.prompts.md',
    entry: 'a prompt',
    prompts: [{ label: 'Title #tags' }, { label: 'Prompt' }],
    add: (content, answers) => appendPrompt(content, answers),
  },
  {
    suffix: '.commands.md',
    entry: 'a command',
    prompts: [{ label: 'Title #tags' }, { label: 'Command — {{name}} for a parameter' }],
    add: (content, answers) => appendCommand(content, answers),
  },
];

export const ENTRY_SUFFIXES = ENTRY_KINDS.map((kind) => kind.suffix);

/** The kind a path's name says it is, if the palette can add to it. */
export const entryKindOf = (path: string) =>
  ENTRY_KINDS.find((kind) => path.toLowerCase().endsWith(kind.suffix));
