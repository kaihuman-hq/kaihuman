import { localDate } from '../../dates.js';
import type { Ulid } from '../ids.js';
import type { FileChanges } from '../issue.js';
import { appendJsonl } from '../jsonl.js';
import { clientDir, EVENTS_PATH } from '../paths.js';
import { type ClientStage, type DocEvent, type Draft, type Issued, KEY_ORDER } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { deriveOfferStatus } from '../status.js';
import { validateEvent } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

const refuse = (message: string) => ({ ok: false as const, issues: [{ path: 'offer', message }] });

/** A won offer makes the client active; a past or lost client keeps its stage (a decision is not a reactivation). */
const BECOMES_ACTIVE: readonly ClientStage[] = ['lead', 'contacted', 'offer-sent'];

/**
 * `eventsText` is the current text of `events.jsonl`, or `null` when there is none. One decision
 * per offer: a later change of mind is a new offer, so the history stays readable.
 */
export const decideOffer = (
  repo: BusinessRepo,
  eventsText: string | null,
  offer: string,
  decision: 'accepted' | 'declined',
  now: Date,
  id: Ulid,
): Result<{ changes: FileChanges; message: string }> => {
  const doc = repo.issued.find((i) => i.doc.number === offer)?.doc;
  if (!doc || doc.kind !== 'offer') return refuse(`unknown offer "${offer}"`);
  const status = deriveOfferStatus(
    doc,
    repo.events,
    repo.issued.map((i) => i.doc),
    localDate(now),
  );
  if (status === 'superseded') return refuse(`${offer} was replaced by a newer offer.`);
  if (status === 'accepted' || status === 'declined') {
    return refuse(`${offer} was already ${status}.`);
  }
  const event: DocEvent = { id, at: now.toISOString(), doc: offer, type: decision };
  const checked = validateEvent(event);
  if (!checked.ok) return checked;
  const changes: FileChanges = {
    [EVENTS_PATH]: appendJsonl(eventsText ?? '', checked.value, KEY_ORDER.event),
  };
  const client = repo.clients.find((c) => c.slug === doc.client);
  if (decision === 'accepted' && client && BECOMES_ACTIVE.includes(client.stage)) {
    const { slug: _slug, ...body } = client;
    changes[`${clientDir(client.slug)}/client.yaml`] = stringifyYaml(
      { ...body, stage: 'active' },
      KEY_ORDER.client,
    );
  }
  return { ok: true, value: { changes, message: `business: ${decision} ${offer}` } };
};

/** The invoice draft for an accepted offer; the user reviews it before it is issued. */
export const offerToInvoiceDraft = (offer: Issued, id: Ulid): Draft => {
  const buyerReference = offer.buyer_reference ?? offer.buyer.buyer_reference;
  return {
    id,
    kind: 'invoice',
    client: offer.client,
    ...(offer.project ? { project: offer.project } : {}),
    ...(offer.currency ? { currency: offer.currency } : {}),
    ...(offer.language ? { language: offer.language } : {}),
    lines: offer.lines.map((l) => ({ ...l })),
    from_offer: offer.number,
    ...(buyerReference ? { buyer_reference: buyerReference } : {}),
  };
};
