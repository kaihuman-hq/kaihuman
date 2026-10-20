import { peek, put } from './cache.js';
import { buildWorkContext, contextText, type WorkContext } from './context.js';
import { promptJson } from './model.js';

/** The focus card is read from `aiCache` by the new tab page; only the worker runs the model. */
export const FOCUS_KEY = 'card:focus';

const MAX_FOCUS = 120;
const HOUR_MS = 3_600_000;
// A refused answer is remembered briefly, so a model that keeps refusing is not asked on every run.
const REFUSED_TTL_MS = 15 * 60_000;
const FOCUS_REFUSED_KEY = 'card:focus:refused';

const FOCUS_SCHEMA = {
  type: 'object',
  properties: { focus: { type: 'string', maxLength: MAX_FOCUS } },
  required: ['focus'],
  additionalProperties: false,
};

const FOCUS_SYSTEM = [
  'You name the one thing the user should focus on next, from their work list.',
  'Answer with one plain sentence of at most 120 characters. Use only things named in the list.',
].join(' ');

export async function focusLine(ctx: WorkContext): Promise<string | null> {
  const input = contextText(ctx);
  // An empty list would only invite the model to invent a focus.
  if (input === '') return null;
  return promptJson<string>({
    system: FOCUS_SYSTEM,
    input,
    schema: FOCUS_SCHEMA,
    priority: 'background',
    validate: (raw) => {
      const focus = (raw as { focus?: unknown } | null)?.focus;
      if (typeof focus !== 'string') return null;
      const text = focus.trim();
      return text !== '' && text.length <= MAX_FOCUS ? text : null;
    },
  });
}

type Inputs = Parameters<typeof buildWorkContext>[0];

/** Precompute job body: the focus line at most hourly. `inputs` is read only when work is due. */
export async function precomputeFocus(inputs: () => Promise<Inputs | null>): Promise<void> {
  if ((await peek<string>(FOCUS_KEY)) !== undefined) return;
  if ((await peek(FOCUS_REFUSED_KEY)) !== undefined) return;
  const gathered = await inputs();
  if (!gathered) return;
  const focus = await focusLine(buildWorkContext(gathered));
  if (focus !== null) await put(FOCUS_KEY, focus, HOUR_MS);
  else await put(FOCUS_REFUSED_KEY, true, REFUSED_TTL_MS);
}

export interface AiCards {
  focus?: string;
}

/** What the new tab page shows. */
export async function readAiCards(): Promise<AiCards> {
  const focus = await peek<string>(FOCUS_KEY);
  return focus === undefined ? {} : { focus };
}
