/**
 * The palette's "Summarize this page" and "Ask this page…". Nothing is cached or saved here: the
 * answer goes back to the palette, and saving it is the user's own click.
 */
import { detectLanguage, promptJson, summarize } from './model.js';

/** The most page text the model sees; the start of an article says most of what it is about. */
export const PAGE_TEXT_LIMIT = 12_000;
/** The palette waits this long for a summary or an answer, so the worker stops then too. */
export const PAGE_TIMEOUT_MS = 30_000;

const MAX_ANSWER = 600;
const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s*/;

const ASK_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', maxLength: MAX_ANSWER } },
  required: ['answer'],
};

const ASK_SYSTEM =
  'You answer a question about a web page, using only the page text you are given. ' +
  'If the page does not say, answer that it does not say. Be brief.';

/** Key points of the page, one per line, or null when the model is missing or says nothing. */
export async function pageSummary(text: string): Promise<string[] | null> {
  const summary = await summarize(text.slice(0, PAGE_TEXT_LIMIT), {
    type: 'key-points',
    length: 'medium',
    priority: 'interactive',
    timeoutMs: PAGE_TIMEOUT_MS,
  });
  const lines = (summary ?? '')
    .split('\n')
    .map((line) => line.replace(BULLET, '').trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}

/** The model's answer to `question` from the page text alone, or null. */
export async function askPage(text: string, question: string): Promise<string | null> {
  const page = text.slice(0, PAGE_TEXT_LIMIT);
  const language = await detectLanguage(page.slice(0, 1000), { timeoutMs: PAGE_TIMEOUT_MS });
  return promptJson<string>({
    system: ASK_SYSTEM,
    input: `Page text:\n${page}\n\nQuestion: ${question}`,
    schema: ASK_SCHEMA,
    validate: (raw) => {
      const answer = (raw as { answer?: unknown } | null)?.answer;
      return typeof answer === 'string' && answer.trim()
        ? answer.trim().slice(0, MAX_ANSWER)
        : null;
    },
    priority: 'interactive',
    timeoutMs: PAGE_TIMEOUT_MS,
    languages: language === 'de' ? ['en', 'de'] : ['en'],
  });
}
