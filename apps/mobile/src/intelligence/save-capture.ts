import { githubFileStore } from '@kaihuman/core';
import { checkIn } from '@kaihuman/formats';
import { addBudgetTransaction } from '../components/widgets/budget-tile.js';
import { parseBudgetCsv } from '../components/widgets/tile-controllers.js';
import {
  type CaptureResult,
  githubRepoFiles,
  type QuickCaptureController,
  type RepoFiles,
} from '../screens/quick-capture.js';
import type { SmartCapture } from './smart-capture.js';

/** RepoFiles plus a suffix listing, for the budget and habit files a capture may land in. */
export interface CaptureFiles extends RepoFiles {
  list(suffix: string): string[];
}

export const githubCaptureFiles: CaptureFiles = {
  ...githubRepoFiles,
  list: (suffix) =>
    githubFileStore.tree
      .peek()
      .filter((t) => t.type === 'blob' && t.path.endsWith(suffix))
      .map((t) => t.path),
};

const HABIT_SUFFIX = '.habit.csv';
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Habit name from its file name, e.g. `habits/Morning-run.habit.csv` -> `Morning-run`. */
export const habitName = (path: string): string =>
  (path.split('/').pop() ?? path).slice(0, -HABIT_SUFFIX.length);

export const habitNames = (files: CaptureFiles): string[] =>
  files.list(HABIT_SUFFIX).map(habitName);

/** First habit file whose name contains the spoken one (or the reverse), ignoring case and punctuation. */
export function findHabit(paths: readonly string[], habit: string): string | undefined {
  const want = norm(habit);
  if (!want) return undefined;
  return (
    paths.find((p) => norm(habitName(p)) === want) ??
    paths.find((p) => norm(habitName(p)).includes(want) || want.includes(norm(habitName(p))))
  );
}

const TODO_SUFFIX = '.todos.md';
const baseName = (path: string): string =>
  (path.split('/').pop() ?? path).slice(0, -TODO_SUFFIX.length);
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * Todo file a spoken stream name or a path means: exact path, then exact name, then the unique
 * file whose name contains the spoken one (or the reverse); case, accents and punctuation ignored.
 * Ambiguous or unknown gives undefined, so the caller never guesses a file.
 */
export function findStream(paths: readonly string[], target: string): string | undefined {
  const exact = paths.find((p) => p === target);
  if (exact) return exact;
  const want = fold(target.replace(/\.todos\.md$/, ''));
  if (!want) return undefined;
  const named = paths.filter((p) => fold(baseName(p)) === want);
  if (named.length) return named.length === 1 ? named[0] : undefined;
  const near = paths.filter((p) => {
    const n = fold(baseName(p));
    return n.length > 0 && (n.includes(want) || want.includes(n));
  });
  return near.length === 1 ? near[0] : undefined;
}

const fail = (error: string): CaptureResult => ({ ok: false, error });

/**
 * Writes a capture where its kind belongs. Budget and habit captures need an existing file; without
 * one they become a log entry, so nothing the user said is lost and no file appears unasked.
 */
export async function saveCapture(
  capture: SmartCapture,
  deps: { controller: QuickCaptureController; files: CaptureFiles },
): Promise<CaptureResult> {
  const { controller, files } = deps;
  switch (capture.kind) {
    case 'todo': {
      if (!capture.target) return controller.quickTodo(capture.text, capture.tags, capture.due);
      const path = findStream(files.list(TODO_SUFFIX), capture.target);
      // The stream vanished since Siri saw it: keep the todo in the inbox rather than lose it.
      return controller.quickTodo(capture.text, capture.tags, capture.due, undefined, path);
    }
    case 'log':
      return controller.quickLog(capture.text, capture.tags);
    case 'budget': {
      const path = files.list('.budget.csv')[0];
      if (!path) return controller.quickLog(`${capture.name}: ${capture.amount}`, ['money']);
      const current = (await files.read(path)) ?? '';
      const account = parseBudgetCsv(current).at(-1)?.account || 'cash';
      const next = addBudgetTransaction(current, {
        name: capture.name,
        account,
        category: capture.category,
        value: String(capture.amount),
        date: capture.date,
      });
      if (!next.ok) return fail(next.error);
      await files.write(path, next.content);
      return { ok: true, path, message: 'Budget line added' };
    }
    case 'habit': {
      const path = findHabit(files.list(HABIT_SUFFIX), capture.habit);
      if (!path) return controller.quickLog(capture.habit, ['habit']);
      await files.write(path, checkIn((await files.read(path)) ?? '', capture.date));
      return { ok: true, path, message: `Checked in ${habitName(path)}` };
    }
  }
}
