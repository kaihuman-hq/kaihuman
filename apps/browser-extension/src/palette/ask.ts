/**
 * The palette's `ask`, for every extension surface: the worker turns the query into an action
 * (`INTENT_PARSE`) and runs it on Enter (`INTENT_RUN`), so the model and the repo writes stay
 * in the worker, and the page only ever shows the preview.
 */
import type { ModeItem } from '@kaihuman/palette';

type Send = (message: object) => Promise<any>;

export const askHandler =
  (send: Send, page: () => { url: string; title: string }, opts: { reuse?: boolean } = {}) =>
  async (query: string): Promise<ModeItem | null> => {
    const { url, title } = page();
    const response = await send({ type: 'INTENT_PARSE', text: query, url, title }).catch(
      () => null,
    );
    const intent = response?.intent;
    if (!intent || typeof response.preview !== 'string') return null;
    const preview: string = response.preview;
    return {
      id: `ask:${query}`,
      title: preview,
      subtitle: 'Ask kaihuman — ⏎ does it',
      action: {
        id: 'ask',
        title: preview,
        // Built from this query, so Recent could not replay it.
        recent: false,
        // A bookmark opens a page, which is what the palette was for.
        closes: intent.action === 'open-bookmark',
        run: async () => {
          await send({ type: 'INTENT_RUN', intent, url, title, reuse: opts.reuse === true });
          return `Done: ${preview}`;
        },
      },
    };
  };
