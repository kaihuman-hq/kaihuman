/**
 * The files the palette adds entries to, and what it asks for each. Writing the entry is
 * `@lifosy/formats`' — the same functions the console's Add forms use — so the palette only turns
 * its answers into that function's input.
 */
import {
  addActionLogEntry,
  addCommandEntry,
  addEventEntry,
  addPromptEntry,
  addTodoEntry,
} from '@lifosy/formats';
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

const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-09-24`, in local time. */
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * The files the palette can add to. The desktop's backend keeps the same suffixes
 * (`ENTRY_SUFFIXES` in apps/desktop-palette/src-tauri/src/entries.rs) and writes no other files.
 */
export const ENTRY_KINDS: readonly EntryKind[] = [
  {
    suffix: '.todos.md',
    entry: 'a todo',
    prompts: [{ label: 'What needs to be done? #tags' }],
    add: (content, [text = ''], now) => addTodoEntry(content, { text }, now),
  },
  {
    suffix: '.actionlog.md',
    entry: 'an action',
    prompts: [{ label: 'What happened? #tags' }],
    add: (content, [description = ''], now) => addActionLogEntry(content, { description }, now),
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
    add: (content, [name = '', type = '', startDate = '', endDate = '']) =>
      addEventEntry(content, { name, type, startDate, endDate }),
  },
  {
    suffix: '.prompts.md',
    entry: 'a prompt',
    prompts: [{ label: 'Title #tags' }, { label: 'Prompt' }],
    add: (content, [title = '', body = '']) => addPromptEntry(content, { title, body }),
  },
  {
    suffix: '.commands.md',
    entry: 'a command',
    prompts: [{ label: 'Title #tags' }, { label: 'Command — {{name}} for a parameter' }],
    add: (content, [title = '', command = '']) => addCommandEntry(content, { title, command }),
  },
];

export const ENTRY_SUFFIXES = ENTRY_KINDS.map((kind) => kind.suffix);

/** The kind a path's name says it is, if the palette can add to it. */
export const entryKindOf = (path: string) =>
  ENTRY_KINDS.find((kind) => path.toLowerCase().endsWith(kind.suffix));
