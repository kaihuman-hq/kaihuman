import type { ModeItem, PaletteMode } from '@kaihuman/palette';

interface Note {
  id: string;
  title: string;
  text: string;
  path: string;
  url: string;
}

const KEYWORD_LIMIT = 30;
const SHOWN = 8;

const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/**
 * Up to `limit` notes, those sharing the most words with the query first. Notes sharing none
 * still fill the tail in their given order: the model, not the words, decides whether a note
 * about "offline conflicts" answers "sync problems".
 */
export function keywordCandidates<T extends { id: string; text: string }>(
  query: string,
  notes: T[],
  limit = KEYWORD_LIMIT,
): T[] {
  const wanted = wordsOf(query);
  return notes
    .map((note, order) => {
      let overlap = 0;
      for (const word of wordsOf(note.text)) if (wanted.has(word)) overlap++;
      return { note, order, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || a.order - b.order)
    .slice(0, limit)
    .map(({ note }) => note);
}

/** `>n`: braindumps and ideas found by meaning. The model only re-orders the keyword shortlist. */
export function notesMode(send: (m: object) => Promise<any>): PaletteMode {
  return {
    prefix: 'n',
    title: 'Notes',
    placeholder: 'Describe what you remember…',
    description:
      'Searches braindumps and ideas by meaning: words narrow them down, the on-device model orders the best.',
    submit: async (query) => {
      const { notes } = (await send({ type: 'LIST_NOTES' })) as { notes: Note[] };
      const candidates = keywordCandidates(query, notes);
      // A missing or failing model is not an error: the keyword order is still an answer.
      const ranked: { ids?: string[] | null } = await send({
        type: 'RERANK',
        query,
        items: candidates.map(({ id, text }) => ({ id, text })),
      }).catch(() => ({}));
      const byId = new Map(candidates.map((note) => [note.id, note]));
      const first = (ranked.ids ?? []).flatMap((id) => {
        const note = byId.get(id);
        byId.delete(id);
        return note ? [note] : [];
      });
      return [...first, ...byId.values()].slice(0, SHOWN).map(
        (note): ModeItem => ({
          id: note.id,
          title: note.title,
          subtitle: note.path,
          url: note.url,
        }),
      );
    },
  };
}
