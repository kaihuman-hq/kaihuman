/**
 * Adding one entry to a widget's file — the one implementation every app uses: the console's Add
 * forms and quick-add pages, the browser extension's popup and start page, and both command
 * palettes. Each function takes the file's text and returns it with the entry added, parsed and
 * written back the way the widget itself does, so a change here reaches every app at once.
 *
 * Each throws a message to show when the entry cannot be written.
 */
import { appendAction, parseActionLog, serializeActionLog } from './action-log.js';
import { addCommand } from './commands.js';
import { type EventEntry, parseEvents, serializeEvents } from './events.js';
import { addPrompt, parsePrompts, serializePrompts } from './prompts.js';
import {
  parseReadItLaterForWrite,
  type ReadItLaterItem,
  serializeReadItLater,
} from './read-later.js';
import {
  addTodo,
  moveTodo,
  parseTodos,
  serializeTodos,
  setTodoDue,
  type TodoDue,
  type TodoPrompt,
} from './todos.js';

const TAG = /#([\w-]+)/g;

/** `Call #admin the bank` → `Call the bank` and `['admin']`: tags typed into the text itself. */
export const splitInlineTags = (input: string): { text: string; tags: string[] } => ({
  text: input.replace(TAG, '').replace(/\s+/g, ' ').trim(),
  tags: Array.from(input.matchAll(TAG), ([, tag]) => tag ?? ''),
});

const unique = (tags: string[]) => [...new Set(tags.filter(Boolean))];

export interface TodoEntry {
  /** `#tags` typed into the text join `tags`. */
  text: string;
  tags?: string[];
  milestoneId?: string;
  prompt?: TodoPrompt;
  due?: TodoDue;
  /** Default `end`; streams add new items on top. */
  position?: 'top' | 'end';
}

/** A backlog todo at the end (or top) of a `.todos.md`. */
export function addTodoEntry(content: string, entry: TodoEntry, now = new Date()): string {
  const { text, tags } = splitInlineTags(entry.text);
  if (!text) throw new Error('Nothing to add');
  const added = addTodo(
    parseTodos(content),
    text,
    unique([...(entry.tags ?? []), ...tags]),
    entry.milestoneId,
    entry.prompt,
    now,
  );
  const last = added.items[added.items.length - 1];
  const data = entry.due && last ? setTodoDue(added, last.id, entry.due) : added;
  return serializeTodos(entry.position === 'top' ? moveTodo(data, data.items.length - 1, 0) : data);
}

export interface ActionLogEntryInput {
  /** Kept as typed, `#tags` and all. */
  description: string;
  /** Appended to the description as `#tag` unless it already has them. */
  tags?: string[];
}

/** `- YYYY-MM-DD HH:mm:ss description #tags` (local time) at the end of an `.actionlog.md`. */
export function addActionLogEntry(
  content: string,
  entry: ActionLogEntryInput,
  now = new Date(),
): string {
  const description = entry.description.trim();
  if (!description) throw new Error('Nothing to add');
  return serializeActionLog(
    appendAction(parseActionLog(content), description, entry.tags ?? [], now),
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `name;type;start;end` row in an `.events.csv`. A birthday is one day, and a missing end date
 * means the event ends the day it starts.
 */
export function addEventEntry(
  content: string,
  entry: Omit<EventEntry, 'endDate'> & { endDate?: string },
): string {
  const name = entry.name.trim();
  if (!name) throw new Error('An event needs a name');
  // The file is `;`-separated with no quoting, so a `;` would split the name into columns.
  if (name.includes(';')) throw new Error('An event name cannot contain “;”');
  const type = entry.type.trim().toLowerCase() || 'general';
  if (!/^[\w-]+$/.test(type)) throw new Error('The type is one word, like general or birthday');
  const startDate = entry.startDate.trim();
  if (!ISO_DATE.test(startDate)) throw new Error('The start date is YYYY-MM-DD');
  const endDate = type === 'birthday' ? startDate : entry.endDate?.trim() || startDate;
  if (!ISO_DATE.test(endDate)) throw new Error('The end date is YYYY-MM-DD');
  if (endDate < startDate) throw new Error('The event ends before it starts');
  const data = parseEvents(content);
  return serializeEvents({ entries: [...data.entries, { name, type, startDate, endDate }] });
}

export interface SectionEntry {
  /** `#tags` typed into the title join `tags`. */
  title: string;
  tags?: string[];
}

/** A `## Title #tags` section at the end of a `.prompts.md`. */
export function addPromptEntry(content: string, entry: SectionEntry & { body: string }): string {
  if (!splitInlineTags(entry.title).text) throw new Error('A prompt needs a title');
  if (!entry.body.trim()) throw new Error('Nothing to add');
  return serializePrompts(
    addPrompt(parsePrompts(content), entry.title, entry.tags ?? [], entry.body),
  );
}

/** A `## Title #tags` section with the command in a `sh` block, at the end of a `.commands.md`. */
export function addCommandEntry(
  content: string,
  entry: SectionEntry & { command: string; note?: string },
): string {
  if (!splitInlineTags(entry.title).text) throw new Error('A command needs a title');
  if (!entry.command.trim()) throw new Error('Nothing to add');
  return addCommand(content, entry.title, entry.tags ?? [], entry.command, entry.note);
}

/** A page at the end of a `.readitlater.json`, unless it is already there unread. */
export function addReadLaterEntry(
  content: string,
  page: { url: string; title: string; summary?: string; tags?: string[]; readMinutes?: number },
  id: string,
  now = Date.now(),
): string {
  const config = parseReadItLaterForWrite(content);
  if (config.items.some((item) => item.url === page.url && item.status === 'new')) {
    throw new Error('Already on the read-later list');
  }
  const item: ReadItLaterItem = {
    id,
    url: page.url,
    name: page.title.trim() || page.url,
    status: 'new',
    tags: page.tags ?? [],
    ...(page.summary ? { summary: page.summary } : {}),
    ...(page.readMinutes ? { readMinutes: page.readMinutes } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return serializeReadItLater({ items: [...config.items, item] });
}
