import { type AiSettings, readAiSettings } from './settings.js';

/**
 * Background model work (rankings, cards, labels) that fills `aiCache` ahead of time, so the new
 * tab page and the side panel read answers instead of waiting on the model.
 */
export interface PrecomputeJob {
  id: string;
  group: keyof Omit<AiSettings, 'inboxLabels'>;
  run: () => Promise<void>;
}

const jobs = new Map<string, PrecomputeJob>();
let running: Promise<void> | undefined;

/** Registering the same id again replaces the job, keeping its place. */
export function registerPrecompute(job: PrecomputeJob): void {
  jobs.set(job.id, job);
}

/** Work cycles land every 30 to 60 s; precompute runs for them at most this often. */
const WORK_THROTTLE_MS = 10 * 60_000;
const LAST_RUN_KEY = 'aiPrecomputeAt';

// Session storage outlives a worker restart, which a module variable would not, and is cleared
// with the browser, so a fresh start may precompute at once.
const runStore = () => chrome.storage.session ?? chrome.storage.local;

/**
 * Runs the jobs one after another. A call while a run is going joins it: the alarm, a start page
 * sync and a work cycle can land together. A work cycle starts a run only when none started in
 * the last ten minutes; the hourly alarm and a start page sync always run.
 */
export function runPrecompute(reason: 'alarm' | 'today' | 'work'): Promise<void> {
  if (running) return running;
  // Nothing registered: skip even the settings read, which every work cycle would otherwise pay.
  if (jobs.size === 0) return Promise.resolve();
  running = runAll(reason).finally(() => {
    running = undefined;
  });
  return running;
}

async function runAll(reason: 'alarm' | 'today' | 'work'): Promise<void> {
  let settings: AiSettings;
  try {
    if (reason === 'work') {
      const stored = (await runStore().get(LAST_RUN_KEY))[LAST_RUN_KEY];
      if (typeof stored === 'number' && Date.now() - stored < WORK_THROTTLE_MS) return;
    }
    await runStore().set({ [LAST_RUN_KEY]: Date.now() });
    settings = await readAiSettings();
  } catch (error) {
    console.warn('kaihuman: reading the AI settings failed', error);
    return;
  }
  for (const job of [...jobs.values()]) {
    if (!settings[job.group]) continue;
    try {
      await job.run();
    } catch (error) {
      console.warn(`kaihuman: AI precompute job ${job.id} (${reason}) failed`, error);
    }
  }
}

/** Starts a run without making the caller wait for it or fail with it. */
export function precomputeInBackground(reason: 'alarm' | 'today' | 'work'): void {
  runPrecompute(reason).catch((error) => console.warn('kaihuman: AI precompute failed', error));
}

export const AI_ALARM = 'ai';

/**
 * Creates the hourly precompute alarm unless it is there: `create` restarts an existing alarm's
 * period, so a worker restarted more often than hourly would otherwise never see it fire.
 */
export async function ensureAiAlarm(): Promise<void> {
  if (await chrome.alarms.get(AI_ALARM)) return;
  await chrome.alarms.create(AI_ALARM, { periodInMinutes: 60 });
}
