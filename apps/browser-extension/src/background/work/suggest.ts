import {
  itemRefOf,
  newItemId,
  newStreamId,
  type StreamId,
  type StreamOp,
  type StreamsFile,
} from '@kaihuman/formats';
import { promptJson } from '../ai/model.js';

/** Something about to be pinned: an open tab, an inbox row or a page from the menu. */
export interface Candidate {
  url: string;
  title: string;
}

export type SuggestedStream = { kind: 'existing'; id: StreamId } | { kind: 'new'; name: string };

export interface Suggestion {
  stream: SuggestedStream;
  labels: string[];
  /** `model`: Chrome's on-device model chose; `rules`: same-repository items decided. */
  source: 'model' | 'rules';
}

/** The answer the model may give for a "new stream" pick. */
export const NEW_STREAM = '(new stream)';
const MAX_LABELS = 3;
const MAX_LABEL_LENGTH = 24;
const MAX_NAME_LENGTH = 40;
const MAX_STREAMS = 15;
const ITEMS_PER_STREAM = 4;
const MAX_TITLE = 80;
const MAX_KNOWN_LABELS = 25;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const repoOf = (url: string) => {
  const ref = itemRefOf(url);
  if (!ref) return undefined;
  return ref.kind === 'link' ? undefined : `${ref.owner}/${ref.repo}`;
};

const whereOf = (url: string) => {
  const ref = itemRefOf(url);
  if (!ref) return url;
  if (ref.kind === 'link') return ref.host.replace(/^www\./, '');
  const kind = ref.kind === 'github-pr' ? 'pull request' : 'issue';
  return `${kind} ${ref.owner}/${ref.repo}#${ref.number}`;
};

/**
 * The stream that holds most of the candidate's repository, when one clearly does: every other
 * stream has fewer of its items. Cheap, explainable, and the answer when the model is missing.
 */
export function ruleSuggestion(file: StreamsFile, candidate: Candidate): Suggestion | null {
  const repo = repoOf(candidate.url);
  if (!repo) return null;
  const counts = file.streams
    .map((stream) => ({
      id: stream.id,
      count: stream.items.filter((item) => repoOf(item.url) === repo).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const [first, second] = counts;
  if (!first || (second && second.count === first.count)) return null;
  return { stream: { kind: 'existing', id: first.id }, labels: [], source: 'rules' };
}

/** The labels already in use, most used first, so the model reuses them before inventing more. */
const knownLabels = (file: StreamsFile) => {
  const counts = new Map<string, number>();
  for (const item of file.streams.flatMap((stream) => stream.items)) {
    for (const label of item.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KNOWN_LABELS)
    .map(([label]) => label);
};

export const SYSTEM_PROMPT = [
  'You file GitHub issues, pull requests and web pages into the user’s work streams.',
  'A stream is one piece of work the user is doing, such as a project or a migration.',
  'Pick the existing stream the item belongs to.',
  `Answer "${NEW_STREAM}" only when no stream fits, and then name the new stream in two to four words.`,
  'Suggest at most three short lowercase labels, reusing the user’s labels when they fit.',
].join(' ');

/** The streams and the candidate, in as few tokens as the choice needs. */
export function promptFor(file: StreamsFile, candidate: Candidate): string {
  const streams = file.streams.slice(0, MAX_STREAMS).map((stream) => {
    const items = stream.items
      .filter((item) => !item.doneAt)
      .slice(-ITEMS_PER_STREAM)
      .map((item) => `  - ${clip(item.title, MAX_TITLE)} (${whereOf(item.url)})`);
    return [`Stream "${stream.name}"`, ...(items.length ? items : ['  - (empty)'])].join('\n');
  });
  const labels = knownLabels(file);
  const hint = ruleSuggestion(file, candidate);
  const hinted =
    hint?.stream.kind === 'existing'
      ? file.streams.find((stream) => stream.id === (hint.stream as { id: StreamId }).id)
      : undefined;
  return [
    'Streams:',
    streams.length ? streams.join('\n') : '(none yet)',
    `Labels in use: ${labels.length ? labels.join(', ') : '(none)'}`,
    hinted ? `Most items from the same repository are in "${hinted.name}".` : '',
    `Item to file: ${clip(candidate.title, MAX_TITLE * 2)} (${whereOf(candidate.url)})`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Constrains the model's answer to a stream it was shown, or the new-stream choice. */
export function schemaFor(file: StreamsFile): object {
  const names = [...new Set(file.streams.slice(0, MAX_STREAMS).map((stream) => stream.name))];
  return {
    type: 'object',
    properties: {
      stream: { type: 'string', enum: [...names, NEW_STREAM] },
      newStreamName: { type: 'string', maxLength: MAX_NAME_LENGTH },
      labels: {
        type: 'array',
        items: { type: 'string', maxLength: MAX_LABEL_LENGTH },
        maxItems: MAX_LABELS,
      },
    },
    required: ['stream', 'labels'],
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The model's answer as a suggestion, or null when it is not one: the schema narrows what it can
 * say, but a small model can still name a stream it was not shown or leave a new one unnamed.
 */
export function parseModelAnswer(raw: string, file: StreamsFile): Suggestion | null {
  let answer: unknown;
  try {
    answer = JSON.parse(raw);
  } catch {
    return null;
  }
  return suggestionFrom(answer, file);
}

/** An already parsed answer as a suggestion, or null when it is not one. */
function suggestionFrom(parsed: unknown, file: StreamsFile): Suggestion | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const answer = parsed as { stream?: unknown; newStreamName?: unknown; labels?: unknown };
  if (typeof answer.stream !== 'string') return null;
  const labels = [
    ...new Set(
      (Array.isArray(answer.labels) ? answer.labels : [])
        .filter((label): label is string => typeof label === 'string')
        .map((label) => label.trim().toLowerCase().slice(0, MAX_LABEL_LENGTH))
        .filter((label) => label !== ''),
    ),
  ].slice(0, MAX_LABELS);
  const pick = answer.stream;
  if (pick === NEW_STREAM) {
    const name =
      typeof answer.newStreamName === 'string'
        ? answer.newStreamName.trim().slice(0, MAX_NAME_LENGTH)
        : '';
    if (!name) return null;
    // A "new" stream that already exists by name is that stream.
    const existing = file.streams.find((stream) => sameName(stream.name, name));
    return {
      stream: existing ? { kind: 'existing', id: existing.id } : { kind: 'new', name },
      labels,
      source: 'model',
    };
  }
  const stream = file.streams.find((candidate) => candidate.name === pick);
  return stream ? { stream: { kind: 'existing', id: stream.id }, labels, source: 'model' } : null;
}

/** The ops that file a candidate as suggested, creating the stream first when it is new. */
export function suggestionOps(
  suggestion: Suggestion,
  candidate: Candidate,
  at: string,
): { streamId: StreamId; ops: StreamOp[] } {
  const ops: StreamOp[] = [];
  let streamId: StreamId;
  if (suggestion.stream.kind === 'new') {
    streamId = newStreamId();
    ops.push({ op: 'addStream', streamId, name: suggestion.stream.name, at });
  } else {
    streamId = suggestion.stream.id;
  }
  ops.push({
    op: 'pin',
    streamId,
    itemId: newItemId(),
    url: candidate.url,
    title: candidate.title || candidate.url,
    labels: suggestion.labels,
    at,
  });
  return { streamId, ops };
}

// The model's plumbing moved to the shared AI layer; the side panel still imports it from here.
export { downloadModel, type ModelAvailability, modelAvailability } from '../ai/model.js';

/** The model's pick, or null when it is missing, still downloading, or answers nonsense. */
export function modelSuggestion(
  file: StreamsFile,
  candidate: Candidate,
): Promise<Suggestion | null> {
  return promptJson({
    system: SYSTEM_PROMPT,
    input: promptFor(file, candidate),
    schema: schemaFor(file),
    validate: (answer) => suggestionFrom(answer, file),
  });
}

/** The model's pick when it can give one, else the same-repository rule, else nothing. */
export async function suggestStream(
  file: StreamsFile,
  candidate: Candidate,
): Promise<Suggestion | null> {
  return (await modelSuggestion(file, candidate)) ?? ruleSuggestion(file, candidate);
}
