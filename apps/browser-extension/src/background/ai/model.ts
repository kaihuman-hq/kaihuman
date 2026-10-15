import { enqueue, type Priority } from './queue.js';

export type { Priority } from './queue.js';

/* Chrome's built-in AI APIs. Typed here: no published types match Chrome 155. */

export type Capability = 'prompt' | 'summarizer' | 'translator' | 'detector';
export type ModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface Destroyable {
  destroy(): void;
}

/** Text, or one user message mixing text and images (the Prompt API's multimodal form). */
type PromptInput =
  | string
  | {
      role: 'user';
      content: ({ type: 'text'; value: string } | { type: 'image'; value: Blob })[];
    }[];

interface ModelSession extends Destroyable {
  prompt(input: PromptInput, options?: { responseConstraint?: object }): Promise<string>;
}

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface LanguageModelApi {
  availability(options?: object): Promise<ModelAvailability>;
  create(options?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    expectedInputs?: object[];
    expectedOutputs?: object[];
    monitor?: (monitor: DownloadMonitor) => void;
  }): Promise<ModelSession>;
}

type SummaryType = 'tldr' | 'key-points' | 'headline';
type SummaryLength = 'short' | 'medium' | 'long';

interface SummarizerOptions {
  type: SummaryType;
  length: SummaryLength;
  format: 'plain-text';
}

interface SummarizerApi {
  availability(options?: object): Promise<ModelAvailability>;
  create(
    options: SummarizerOptions,
  ): Promise<
    Destroyable & { summarize(text: string, options?: { context?: string }): Promise<string> }
  >;
}

interface TranslatorOptions {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorApi {
  availability(options: TranslatorOptions): Promise<ModelAvailability>;
  create(
    options: TranslatorOptions,
  ): Promise<Destroyable & { translate(text: string): Promise<string> }>;
}

interface LanguageDetectorApi {
  availability(options?: object): Promise<ModelAvailability>;
  create(): Promise<
    Destroyable & {
      detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
    }
  >;
}

interface AiGlobals {
  LanguageModel?: LanguageModelApi;
  Summarizer?: SummarizerApi;
  Translator?: TranslatorApi;
  LanguageDetector?: LanguageDetectorApi;
}

const globals = () => globalThis as AiGlobals;

// Prompts, schemas and labels are English; callers add a language the input is in (D8).
const languages = (list: string[] = ['en'], images = false) => ({
  expectedInputs: [{ type: 'text', languages: list }, ...(images ? [{ type: 'image' }] : [])],
  expectedOutputs: [{ type: 'text', languages: list }],
});

const SUMMARY_DEFAULTS: SummarizerOptions = { type: 'tldr', length: 'short', format: 'plain-text' };
// The translator's availability depends on the pair. The settings button speaks for both
// directions of English and German, so both are asked; `translate` checks its own pair.
const TRANSLATOR_PAIRS: TranslatorOptions[] = [
  { sourceLanguage: 'en', targetLanguage: 'de' },
  { sourceLanguage: 'de', targetLanguage: 'en' },
];
// The least ready of several states is the state of the lot.
const READINESS: ModelAvailability[] = ['unavailable', 'downloading', 'downloadable', 'available'];

async function leastReady(
  api: NonNullable<ReturnType<typeof globals>['Translator']>,
  pairs: TranslatorOptions[],
): Promise<ModelAvailability> {
  const states = await Promise.all(pairs.map((pair) => api.availability(pair)));
  return READINESS.find((state) => states.includes(state)) ?? 'unavailable';
}

/** Whether this context can use a capability; `unavailable` also covers a Chrome without it. */
export async function availability(cap: Capability): Promise<ModelAvailability> {
  const g = globals();
  try {
    switch (cap) {
      case 'prompt':
        return g.LanguageModel ? await g.LanguageModel.availability(languages()) : 'unavailable';
      case 'summarizer':
        return g.Summarizer ? await g.Summarizer.availability(SUMMARY_DEFAULTS) : 'unavailable';
      case 'translator':
        return g.Translator ? await leastReady(g.Translator, TRANSLATOR_PAIRS) : 'unavailable';
      case 'detector':
        return g.LanguageDetector ? await g.LanguageDetector.availability() : 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
}

export type AiAvailability = Record<Capability, ModelAvailability>;

/** Every capability's state in this context; the worker answers for itself with it. */
export async function aiAvailability(): Promise<AiAvailability> {
  const [prompt, summarizer, translator, detector] = await Promise.all([
    availability('prompt'),
    availability('summarizer'),
    availability('translator'),
    availability('detector'),
  ]);
  return { prompt, summarizer, translator, detector };
}

/** The Prompt API's availability, under the name the side panel already uses. */
export const modelAvailability = (): Promise<ModelAvailability> => availability('prompt');

/**
 * Downloads the model. Chrome only starts the download from a click, so this is called straight
 * from one, before any await.
 */
export async function downloadModel(onProgress: (fraction: number) => void): Promise<void> {
  const model = globals().LanguageModel;
  if (!model) throw new Error('This Chrome has no built-in model.');
  const session = await model.create({
    ...languages(),
    monitor: (monitor) =>
      monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded)),
  });
  session.destroy();
}

/**
 * A background job's longest run. Nobody waits on it, but while it runs nothing else can, and a
 * prompt that never settles would hold the queue (and the precompute run) until the browser
 * restarts.
 */
const BACKGROUND_CEILING_MS = 60_000;

/**
 * Runs `work` in the queue, closing every session it opens. With a timeout, the caller gets null
 * once it passes, counting the wait in the queue, and the queue is freed too: a hung prompt
 * would otherwise block every later call. A background job without one gets the ceiling, counted
 * from when it starts, since waiting behind interactive work is expected. Errors become null,
 * since every caller has a fallback.
 */
function runJob<T>(
  label: string,
  work: (track: <S extends Destroyable>(session: S) => S) => Promise<T | null>,
  priority: Priority,
  timeoutMs?: number,
): Promise<T | null> {
  const sessions: Destroyable[] = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const session of sessions) session.destroy();
  };
  const track = <S extends Destroyable>(session: S): S => {
    if (closed) session.destroy();
    else sessions.push(session);
    return session;
  };

  const timers: ReturnType<typeof setTimeout>[] = [];
  const after = (ms: number) =>
    new Promise<null>((resolve) => {
      timers.push(
        setTimeout(() => {
          close();
          resolve(null);
        }, ms),
      );
    });
  const expired = timeoutMs === undefined ? undefined : after(timeoutMs);

  const guarded = async (): Promise<T | null> => {
    if (closed) return null;
    try {
      return await work(track);
    } catch (error) {
      console.warn(`kaihuman: the built-in model could not ${label}`, error);
      return null;
    } finally {
      close();
    }
  };

  const run = () => {
    const limit = expired ?? (priority === 'background' ? after(BACKGROUND_CEILING_MS) : undefined);
    return limit ? Promise.race([guarded(), limit]) : guarded();
  };
  const job = enqueue(run, priority);
  const result = expired ? Promise.race([job, expired]) : job;
  return result.finally(() => {
    for (const timer of timers) clearTimeout(timer);
  });
}

/**
 * One answer from the Prompt API, held to `schema` and checked again by `validate`: the schema
 * narrows what the model can say, but a small model can still say nonsense. Null when the model
 * is missing, still downloading, too slow, or its answer does not validate.
 */
export async function promptJson<T>(task: {
  system: string;
  input: string;
  schema: object;
  validate: (raw: unknown) => T | null;
  priority?: Priority;
  timeoutMs?: number;
  languages?: string[];
  /** Pictures the question is about; the model must accept image input. */
  images?: Blob[];
}): Promise<T | null> {
  const model = globals().LanguageModel;
  if (!model) return null;
  return runJob(
    'answer',
    async (track) => {
      // The languages the session declares: an extra one may still need downloading.
      const declared = languages(task.languages, !!task.images?.length);
      if ((await model.availability(declared).catch(() => 'unavailable')) !== 'available') {
        return null;
      }
      // A fresh session per task: earlier tasks would otherwise crowd the context and sway it.
      const session = track(
        await model.create({
          ...declared,
          initialPrompts: [{ role: 'system', content: task.system }],
        }),
      );
      const input: PromptInput = task.images?.length
        ? [
            {
              role: 'user',
              content: [
                { type: 'text', value: task.input },
                ...task.images.map((value) => ({ type: 'image' as const, value })),
              ],
            },
          ]
        : task.input;
      const raw = await session.prompt(input, { responseConstraint: task.schema });
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      return task.validate(parsed);
    },
    task.priority ?? 'interactive',
    task.timeoutMs,
  );
}

export async function summarize(
  text: string,
  opts: {
    type: SummaryType;
    length?: SummaryLength;
    context?: string;
    priority?: Priority;
    timeoutMs?: number;
  },
): Promise<string | null> {
  const api = globals().Summarizer;
  if (!api) return null;
  const options: SummarizerOptions = {
    type: opts.type,
    length: opts.length ?? 'short',
    format: 'plain-text',
  };
  return runJob(
    'summarize',
    async (track) => {
      if ((await api.availability(options)) !== 'available') return null;
      const summarizer = track(await api.create(options));
      const summary = await summarizer.summarize(
        text,
        opts.context ? { context: opts.context } : undefined,
      );
      return summary.trim() || null;
    },
    opts.priority ?? 'interactive',
    opts.timeoutMs,
  );
}

/** The most likely language as a BCP-47 base ('de' for 'de-AT'), or null when unsure. */
export async function detectLanguage(
  text: string,
  opts: { priority?: Priority; timeoutMs?: number } = {},
): Promise<string | null> {
  const api = globals().LanguageDetector;
  if (!api) return null;
  return runJob(
    'detect a language',
    async (track) => {
      if ((await api.availability()) !== 'available') return null;
      const detector = track(await api.create());
      const [top] = await detector.detect(text);
      const base = top?.detectedLanguage.split('-')[0]?.toLowerCase();
      return base && base !== 'und' ? base : null;
    },
    opts.priority ?? 'interactive',
    opts.timeoutMs,
  );
}

export async function translate(
  text: string,
  source: string,
  target: string,
  opts: { priority?: Priority; timeoutMs?: number } = {},
): Promise<string | null> {
  const api = globals().Translator;
  if (!api) return null;
  const options = { sourceLanguage: source, targetLanguage: target };
  return runJob(
    'translate',
    async (track) => {
      if ((await api.availability(options)) !== 'available') return null;
      const translator = track(await api.create(options));
      return (await translator.translate(text)) || null;
    },
    opts.priority ?? 'interactive',
    opts.timeoutMs,
  );
}

/**
 * Downloads the English and German translation packs, both directions. Chrome only starts a
 * download from a click, so this is called straight from one, before any await.
 */
export function downloadTranslationPacks(): Promise<void> {
  const api = globals().Translator;
  if (!api) return Promise.reject(new Error('This Chrome has no built-in translator.'));
  // Both creates start now, inside the click's user activation.
  const pairs: TranslatorOptions[] = [
    { sourceLanguage: 'en', targetLanguage: 'de' },
    { sourceLanguage: 'de', targetLanguage: 'en' },
  ];
  return Promise.all(pairs.map((pair) => api.create(pair))).then((translators) => {
    for (const translator of translators) translator.destroy();
  });
}
