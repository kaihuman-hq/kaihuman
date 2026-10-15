import { itemRefOf, type Stream } from '@kaihuman/formats';
import { promptJson } from './model.js';
import { readAiSettings } from './settings.js';

/** An open tab or inbox row that might belong in a stream. */
export interface Candidate {
  id: string;
  title: string;
  url: string;
}

export interface StreamProfile {
  name: string;
  titles: string[];
  /** `owner/repo`, lowercase. */
  repos: string[];
  hosts: string[];
}

export const MAX_CANDIDATES = 40;
const MAX_RELATED = 8;
const MAX_TITLES = 8;
const MAX_TITLE = 80;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Where a URL lives: its repository for GitHub items, else its host. */
const placeOf = (url: string): { repo?: string; host?: string } => {
  const ref = itemRefOf(url);
  if (!ref) return {};
  return ref.kind === 'link'
    ? { host: ref.host.replace(/^www\./, '') }
    : { repo: `${ref.owner}/${ref.repo}` };
};

/** What a stream is about, in the few facts the match needs. */
export function profileOf(stream: Stream): StreamProfile {
  const places = stream.items.map((item) => placeOf(item.url));
  const unique = (values: (string | undefined)[]) => [
    ...new Set(values.filter((v): v is string => v !== undefined)),
  ];
  return {
    name: stream.name,
    titles: stream.items
      .filter((item) => !item.doneAt)
      .slice(-MAX_TITLES)
      .map((item) => item.title),
    repos: unique(places.map((p) => p.repo)),
    hosts: unique(places.map((p) => p.host)),
  };
}

/** Same repository or same host as something already in the stream; no model needed. */
function ruleMatches(stream: StreamProfile, candidates: Candidate[]): string[] {
  return candidates
    .filter((candidate) => {
      const { repo, host } = placeOf(candidate.url);
      return (
        (repo !== undefined && stream.repos.includes(repo)) ||
        (host !== undefined && stream.hosts.includes(host))
      );
    })
    .map((candidate) => candidate.id);
}

const SYSTEM_PROMPT = [
  'You help grow a work stream: one piece of work the user is doing.',
  'From the numbered open tabs and inbox items, pick those that belong to the stream.',
  'Pick none when nothing clearly belongs. Never pick more than eight.',
].join(' ');

/**
 * Up to eight candidate ids that belong with the stream. The model reads numbers, not ids, so a
 * long URL cannot be misquoted; the schema allows only the numbers it was shown.
 */
export async function relatedTo(stream: StreamProfile, candidates: Candidate[]): Promise<string[]> {
  const shown = candidates.slice(0, MAX_CANDIDATES);
  if (shown.length === 0) return [];
  const rules = () => ruleMatches(stream, shown).slice(0, MAX_RELATED);
  const settings = await readAiSettings().catch(() => undefined);
  if (settings?.sidePanel === false) return rules();
  const numbers = shown.map((_, index) => String(index + 1));
  const answer = await promptJson({
    system: SYSTEM_PROMPT,
    input: [
      `Stream "${stream.name}"`,
      ...stream.titles.map((title) => `  - ${clip(title, MAX_TITLE)}`),
      'Candidates:',
      ...shown.map(
        (c, index) => `${index + 1}. ${clip(c.title, MAX_TITLE)} (${c.url.slice(0, 120)})`,
      ),
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        related: {
          type: 'array',
          items: { type: 'string', enum: numbers },
          maxItems: MAX_RELATED,
        },
      },
      required: ['related'],
    },
    validate: (raw) => {
      const related = (raw as { related?: unknown } | null)?.related;
      if (!Array.isArray(related)) return null;
      const ids = related
        .filter((n): n is string => typeof n === 'string' && numbers.includes(n))
        .map((n) => shown[Number(n) - 1]?.id)
        .filter((id): id is string => id !== undefined);
      return [...new Set(ids)].slice(0, MAX_RELATED);
    },
  });
  return answer ?? rules();
}
