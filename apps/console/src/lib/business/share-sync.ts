import {
  appendJsonl,
  type DocEvent,
  EVENTS_PATH,
  KEY_ORDER,
  type LinkRecord,
  parseJsonl,
  type Ulid,
  validateEvent,
} from '@kaihuman/formats/business';
import { parseShareUrl } from '@kaihuman/formats/share';
import type { KBRepo } from '../github-kb';
import type { ShareApi, SharedEvent } from './share';
import { writeBusiness } from './write';

/**
 * The server stamps an event when it commits it, which can be after a later one is already visible.
 * Polling from the newest known event alone would skip those, so each poll starts this far back and
 * the event ids do the deduplication.
 */
const OVERLAP_MS = 10 * 60 * 1000;

const existingEvents = (text: string | null): DocEvent[] =>
  parseJsonl(text ?? '', validateEvent).entries.map((e) => e.value);

/** New `downloaded` events: ids not in the events file yet, for tokens that have a link record. */
export function downloadEvents(
  existingEventsText: string | null,
  serverEvents: SharedEvent[],
  links: LinkRecord[],
): DocEvent[] {
  const seen = new Set<string>(existingEvents(existingEventsText).map((e) => e.id));
  const docOf = new Map<string, string>();
  for (const l of links) {
    const token = parseShareUrl(l.url)?.token;
    if (token) docOf.set(token, l.doc);
  }
  const out: DocEvent[] = [];
  for (const e of serverEvents) {
    const doc = docOf.get(e.token);
    if (!doc || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id as Ulid, at: e.at, doc, type: 'downloaded', note: e.client });
  }
  return out;
}

const PAGE = 500;
const MAX_PAGES = 20;

/**
 * Appends the service's new download events to `events.jsonl` in one commit; nothing new, no commit.
 * The service lists events of all the user's repositories, in pages of at most 500, so a full page
 * can hold nothing of this repo. A full page is therefore followed by the next one (from its last
 * event, 1 ms back so ties are not lost; ids dedupe the overlap) until a short page or 20 pages.
 * Reading happens inside the builder, so a retry after a conflict re-reads and re-dedupes.
 */
export async function syncDownloads(target: KBRepo, api: ShareApi): Promise<{ added: number }> {
  let added = 0;
  await writeBusiness(target, async (fresh) => {
    const text = await fresh.read(EVENTS_PATH);
    const latest = existingEvents(text)
      .filter((e) => e.type === 'downloaded')
      .reduce<number>((best, e) => Math.max(best, Date.parse(e.at)), Number.NEGATIVE_INFINITY);
    const since = Number.isFinite(latest) ? new Date(latest - OVERLAP_MS).toISOString() : undefined;
    const fetched: SharedEvent[] = [];
    let cursor = since;
    for (let page = 0; page < MAX_PAGES; page++) {
      const events = await api.events(cursor);
      fetched.push(...events);
      const last = events[events.length - 1];
      if (events.length < PAGE || !last) break;
      cursor = new Date(Date.parse(last.at) - 1).toISOString();
    }
    const news = downloadEvents(text, fetched, fresh.repo.links);
    added = news.length;
    if (added === 0) return { ok: false, issues: [] };
    return {
      ok: true,
      value: {
        changes: {
          [EVENTS_PATH]: news.reduce((acc, e) => appendJsonl(acc, e, KEY_ORDER.event), text ?? ''),
        },
        message: `business: ${added} downloads`,
      },
    };
  });
  return { added };
}
