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
    case 'todo':
      return controller.quickTodo(capture.text, capture.tags, capture.due);
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
