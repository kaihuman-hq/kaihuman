import {
  addClientLog,
  addClientTodo,
  type Capture,
  clientDir,
  type Result,
  type Slug,
  startTimer,
} from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';
import { writeBusiness, writeErrorMessage } from './write';

const FILES = { todo: 'todos.todos.md', log: 'log.actionlog.md' } as const;

/** One todo or log line into a client's file, committed through the business write layer. */
export const writeClientLine = (
  target: KBRepo,
  kind: 'todo' | 'log',
  client: Slug,
  text: string,
): Promise<Result<{ commitSha: string }>> =>
  writeBusiness(target, async (fresh) => {
    const existing = await fresh.read(`${clientDir(client)}/${FILES[kind]}`);
    const add = kind === 'todo' ? addClientTodo : addClientLog;
    return add(fresh.repo, existing, client, text, new Date());
  });

export type CaptureOutcome = { ok: true; message: string } | { ok: false; message: string };

/** Runs a palette capture. Stopping a timer only opens the prefilled form, so it writes nothing. */
export async function runBusinessCapture(
  target: KBRepo,
  capture: Capture,
  navigate: (url: string) => void,
): Promise<CaptureOutcome> {
  if (capture.kind === 'stop-timer') {
    navigate('/business/time/new?from=timer');
    return { ok: true, message: 'Stop the timer in the form' };
  }
  try {
    const result =
      capture.kind === 'start-timer'
        ? await writeBusiness(target, async (fresh) =>
            startTimer(
              fresh.repo,
              { client: capture.client, ...(capture.project ? { project: capture.project } : {}) },
              new Date(),
            ),
          )
        : await writeClientLine(target, capture.kind, capture.client, capture.text);
    if (!result.ok)
      return { ok: false, message: result.issues[0]?.message ?? 'Nothing was saved.' };
  } catch (e) {
    return { ok: false, message: writeErrorMessage(e) };
  }
  const done = {
    todo: `Todo added for ${capture.client}`,
    log: `Logged for ${capture.client}`,
    'start-timer': `Timer started for ${capture.client}`,
  } as const;
  return { ok: true, message: done[capture.kind] };
}
