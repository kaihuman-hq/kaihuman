import type { StreamsFile } from '@kaihuman/formats';
import { buildInbox } from '../work/inbox.js';
import type { WorkSnapshot } from '../work/types.js';
import { hashKey, peek, put } from './cache.js';
import { promptJson } from './model.js';
import { type InboxLabel, readAiSettings } from './settings.js';

/** key → the name of the user's label the model gave that row. Rows with no label are absent. */
export const INBOX_LABELS_CACHE = 'inbox:labels';

const BATCH = 20;
const NONE = 'none';
const TTL_MS = 24 * 60 * 60 * 1000;

interface Row {
  key: string;
  title: string;
  repo: string;
  reasons: string[];
}

const SYSTEM = [
  'You sort a developer’s GitHub inbox into the labels they wrote for themselves.',
  'Each label has a name and a hint in their own words. Give each row the one label whose hint fits it,',
  `or "${NONE}" when none does. Use only the labels given.`,
].join(' ');

/**
 * The user's label for each row, in batches of 20. The schema lets the model say only a name from
 * the list or 'none', and the answer is checked again, so no label outside the list gets through.
 * Without labels there is nothing to ask, so the model is not called.
 */
export async function labelRows(
  rows: Row[],
  labels: InboxLabel[],
): Promise<Record<string, string>> {
  const assigned: Record<string, string> = {};
  if (labels.length === 0) return assigned;
  const names = labels.map((label) => label.name);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const known = new Set(batch.map((row) => row.key));
    const answer = await promptJson<{ key: string; label: string }[]>({
      system: SYSTEM,
      input: [
        'Labels:',
        ...labels.map((label) => `${label.name}: ${label.hint}`),
        'Rows:',
        ...batch.map((row) => `${row.key}: ${row.title} (${row.repo}) [${row.reasons.join(', ')}]`),
      ].join('\n'),
      schema: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            maxItems: batch.length,
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', enum: batch.map((row) => row.key) },
                label: { type: 'string', enum: [...names, NONE] },
              },
              required: ['key', 'label'],
              additionalProperties: false,
            },
          },
        },
        required: ['rows'],
        additionalProperties: false,
      },
      validate: (raw) => {
        const list = (raw as { rows?: unknown } | null)?.rows;
        if (!Array.isArray(list)) return null;
        return list.flatMap((entry) => {
          const { key, label } = (entry ?? {}) as { key?: unknown; label?: unknown };
          return typeof key === 'string' &&
            known.has(key) &&
            typeof label === 'string' &&
            names.includes(label)
            ? [{ key, label }]
            : [];
        });
      },
      priority: 'background',
    });
    for (const { key, label } of answer ?? []) assigned[key] = label;
  }
  return assigned;
}

/** Keys whose label is one the user muted. A label renamed or removed since mutes nothing. */
export function mutedKeys(assigned: Record<string, string>, labels: InboxLabel[]): Set<string> {
  const muted = new Set(labels.filter((label) => label.mute).map((label) => label.name));
  return new Set(Object.keys(assigned).filter((key) => muted.has(assigned[key] ?? '')));
}

/** The muted keys from the cached labels, for the badge. */
export async function readMutedKeys(): Promise<Set<string>> {
  const assigned = await peek<Record<string, string>>(INBOX_LABELS_CACHE);
  if (!assigned) return new Set();
  return mutedKeys(assigned, (await readAiSettings()).inboxLabels);
}

const labelsHash = (labels: InboxLabel[]) =>
  hashKey(...labels.flatMap((label) => [label.name, label.hint]));

/**
 * Labels the inbox's rows and caches the result. A row is asked about once per update and label
 * list: a changed label list or a newer `updatedAt` asks again, the rest come from the cache.
 */
export async function precomputeInboxLabels(
  snapshot: WorkSnapshot,
  file: StreamsFile | null,
): Promise<void> {
  const { inboxLabels: labels } = await readAiSettings();
  if (labels.length === 0) {
    await put(INBOX_LABELS_CACHE, {}, TTL_MS);
    return;
  }
  const { waiting, activity } = buildInbox(snapshot, file, {});
  const hash = labelsHash(labels);
  const assigned: Record<string, string> = {};
  const todo: Row[] = [];
  const slots = new Map<string, string>();
  for (const row of [...waiting, ...activity]) {
    const slot = `inbox:label:${hashKey(hash, row.key, row.updatedAt)}`;
    slots.set(row.key, slot);
    const hit = await peek<string>(slot);
    if (hit === undefined) todo.push(row);
    else if (hit !== NONE) assigned[row.key] = hit;
  }
  const fresh = await labelRows(todo, labels);
  // A model that was unavailable answers nothing; that must not pin every row to 'none' for a day.
  const answered = Object.keys(fresh).length > 0;
  for (const row of todo) {
    const label = fresh[row.key];
    if (label) assigned[row.key] = label;
    if (label || answered) await put(slots.get(row.key) ?? '', label ?? NONE, TTL_MS);
  }
  await put(INBOX_LABELS_CACHE, assigned, TTL_MS);
}
