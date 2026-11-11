import {
  addClientLog,
  addClientTodo,
  type BusinessRepo,
  cancelTimer,
  clientDir,
  logTime,
  type Payment,
  paymentsPath,
  type Result,
  recordPayment,
  type Slug,
  startTimer,
  type TextChanges,
  type TimeEntry,
  timePath,
  type Ulid,
  ulid,
} from '@kaihuman/formats/business';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { loadBusiness } from './load.js';

type Files = Pick<ContentFiles, 'tree' | 'read' | 'write' | 'create' | 'remove'>;
type Built = Result<{ changes: TextChanges; message: string }>;
export type Outcome = { ok: true; message: string } | { ok: false; message: string };

export const NOT_ENABLED = 'Business is not set up in this repository. Enable it in the console.';

/**
 * Writes a change set file by file through the outbox, so it works offline. The console commits a
 * change set atomically; here each file syncs on its own, which is safe because every business
 * action only appends to one file (and at most deletes the running timer).
 */
export async function applyChanges(files: Files, changes: TextChanges): Promise<void> {
  const present = new Set(
    files
      .tree()
      .filter((t) => t.type === 'blob')
      .map((t) => t.path),
  );
  // Additions first: a stopped timer must not vanish when appending its entry fails.
  const entries = Object.entries(changes).sort(
    ([, a], [, b]) => Number(a === null) - Number(b === null),
  );
  for (const [path, content] of entries) {
    if (content === null) {
      if (present.has(path)) await files.remove(path);
    } else if (present.has(path)) await files.write(path, content);
    else await files.create(path, content);
  }
}

/** Builds a change from the records as they are now, then writes it. */
async function run(
  files: Files,
  build: (repo: BusinessRepo, read: (path: string) => string | null) => Built,
): Promise<Outcome> {
  try {
    const state = await loadBusiness(files);
    if (state.status !== 'ready') return { ok: false, message: NOT_ENABLED };
    const read = (path: string) => state.contents[path] ?? null;
    const built = build(state.repo, read);
    if (!built.ok) return { ok: false, message: built.issues[0]?.message ?? 'Nothing was saved.' };
    await applyChanges(files, built.value.changes);
    return { ok: true, message: built.value.message };
  } catch (e) {
    return { ok: false, message: `Saving failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface BusinessWriter {
  logTime(entry: Omit<TimeEntry, 'id'>, opts?: { stopTimer?: boolean }): Promise<Outcome>;
  startTimer(input: { client: Slug; project?: Slug; note?: string }): Promise<Outcome>;
  cancelTimer(): Promise<Outcome>;
  addClientLine(kind: 'todo' | 'log', client: Slug, text: string): Promise<Outcome>;
  recordPayment(payment: Omit<Payment, 'id'>): Promise<Outcome>;
}

export function businessWriter(
  files: Files,
  deps: { now?: () => Date; id?: () => Ulid } = {},
): BusinessWriter {
  const now = deps.now ?? (() => new Date());
  const id = deps.id ?? ulid;
  return {
    logTime: (entry, opts = {}) =>
      run(files, (repo, read) => {
        const file = timePath(entry.date.slice(0, 7));
        const text = read(file);
        return logTime(repo, text === null ? {} : { [file]: text }, entry, {
          id: id(),
          ...(opts.stopTimer ? { stopTimer: true } : {}),
        });
      }),
    startTimer: (input) => run(files, (repo) => startTimer(repo, input, now())),
    cancelTimer: () => run(files, (repo) => cancelTimer(repo)),
    addClientLine: (kind, client, text) =>
      run(files, (repo, read) => {
        const file = kind === 'todo' ? 'todos.todos.md' : 'log.actionlog.md';
        const add = kind === 'todo' ? addClientTodo : addClientLog;
        return add(repo, read(`${clientDir(client)}/${file}`), client, text, now());
      }),
    recordPayment: (payment) =>
      run(files, (repo, read) =>
        recordPayment(repo, read(paymentsPath(Number(payment.date.slice(0, 4)))), payment, id()),
      ),
  };
}
