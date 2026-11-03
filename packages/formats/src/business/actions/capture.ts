import { asSlug, type Slug } from '../ids.js';
import { classifyBusinessPath, clientDir, TIMER_PATH } from '../paths.js';
import type { BusinessRepo } from '../repo.js';
import type { Result } from '../validate-kit.js';
import { addClientLog, addClientTodo } from './clients.js';
import { startTimer } from './time.js';

export type Capture =
  | { kind: 'todo' | 'log'; client: Slug; text: string }
  | { kind: 'start-timer'; client: Slug; project?: Slug }
  | { kind: 'stop-timer' };

/** An exact slug wins; otherwise the prefix must name exactly one client. */
const resolveClient = (typed: string, clients: readonly string[]): Slug | null => {
  const exact = clients.find((c) => c === typed);
  if (exact) return asSlug(exact);
  const starts = clients.filter((c) => c.startsWith(typed));
  return starts.length === 1 && starts[0] ? asSlug(starts[0]) : null;
};

const WITH_TEXT = /^(todo|log)\s+([a-z0-9-]+):\s*(.+)$/is;
const TIMER = /^timer\s+([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/i;
const STOP = /^stop\s+timer$/i;

/**
 * Reads a palette or quick-capture line such as `todo acme: send draft`, `log acme-gmbh: called`,
 * `timer acme/website` or `stop timer`. `null` when it is none of these or the client is unknown
 * or ambiguous, so the caller shows no result instead of guessing.
 */
export const parseCapture = (query: string, clients: readonly string[]): Capture | null => {
  const q = query.trim();
  if (STOP.test(q)) return { kind: 'stop-timer' };

  const withText = WITH_TEXT.exec(q);
  if (withText) {
    const client = resolveClient((withText[2] ?? '').toLowerCase(), clients);
    const text = (withText[3] ?? '').trim();
    const kind = (withText[1] ?? '').toLowerCase() === 'todo' ? 'todo' : 'log';
    return client && text ? { kind, client, text } : null;
  }

  const timer = TIMER.exec(q);
  if (timer) {
    const client = resolveClient((timer[1] ?? '').toLowerCase(), clients);
    if (!client) return null;
    const project = timer[2] ? asSlug(timer[2].toLowerCase()) : null;
    if (timer[2] && !project) return null;
    return project ? { kind: 'start-timer', client, project } : { kind: 'start-timer', client };
  }
  return null;
};

/** A capture that writes a file; stopping a timer only opens the console's form. */
export type WritingCapture = Exclude<Capture, { kind: 'stop-timer' }>;

const kindOf = (path: string) => classifyBusinessPath(path).kind;

/**
 * The files a surface outside the console reads to offer captures: the profile (business is set
 * up), clients and projects (what a target may name) and the running timer.
 */
export const isCaptureContextPath = (path: string): boolean =>
  ['profile', 'client', 'project', 'timer'].includes(kindOf(path));

/** The only files a capture writes: a client's todo list and log, and the running timer. */
export const isCaptureWritePath = (path: string): boolean =>
  ['todos', 'log', 'timer'].includes(kindOf(path));

/** The one file a capture changes. */
export const capturePath = (capture: WritingCapture): string =>
  capture.kind === 'start-timer'
    ? TIMER_PATH
    : `${clientDir(capture.client)}/${capture.kind === 'todo' ? 'todos.todos.md' : 'log.actionlog.md'}`;

/**
 * The capture as its one file change, built by the same actions the console uses. `existing` is
 * that file's current text, or `null` when it is not there; for the timer it is read fresh, so a
 * timer started since `repo` was loaded is refused too.
 */
export const buildCapture = (
  repo: BusinessRepo,
  capture: WritingCapture,
  existing: string | null,
  now: Date,
): Result<{ path: string; content: string; message: string }> => {
  const path = capturePath(capture);
  if (capture.kind === 'start-timer' && existing !== null) {
    return { ok: false, issues: [{ path: 'timer', message: 'A timer is already running.' }] };
  }
  const built =
    capture.kind === 'start-timer'
      ? // `existing` is null here, so a timer `repo` still shows has been stopped since it loaded.
        startTimer(
          { ...repo, timer: null },
          { client: capture.client, ...(capture.project ? { project: capture.project } : {}) },
          now,
        )
      : (capture.kind === 'todo' ? addClientTodo : addClientLog)(
          repo,
          existing,
          capture.client,
          capture.text,
          now,
        );
  if (!built.ok) return built;
  const content = built.value.changes[path];
  if (typeof content !== 'string') throw new Error(`${path} was not built`);
  return { ok: true, value: { path, content, message: built.value.message } };
};
