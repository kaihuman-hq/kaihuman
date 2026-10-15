/**
 * "Tidy open tabs": the model sorts the window's tabs into a few named groups, offered one at a
 * time. It only ever names tab ids it was given. Nothing is saved or closed here: each proposal
 * becomes a pinned-tab group, stream items or a closed set of tabs only on the user's click.
 */
import { promptJson } from './model.js';
import { readAiSettings } from './settings.js';

export interface TabProposal {
  name: string;
  tabIds: number[];
}

export interface TidyTab {
  id: number;
  title: string;
  url: string;
}

export const MAX_TABS = 40;
export const MAX_PROPOSALS = 4;
/** A group of one or two tabs is not worth a rule proposal. */
export const MIN_GROUP = 3;
export const TIDY_TIMEOUT_MS = 8_000;
const MAX_NAME = 60;
// The schema holds the model to a short label; MAX_NAME only trims what still slips through.
const MAX_SCHEMA_NAME = 40;
const MAX_TITLE = 100;

export function tidySchema(ids: number[]): object {
  return {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PROPOSALS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: MAX_SCHEMA_NAME },
            tabIds: { type: 'array', minItems: 2, items: { type: 'number', enum: ids } },
          },
          required: ['name', 'tabIds'],
        },
      },
    },
    required: ['groups'],
  };
}

const SYSTEM = [
  'You tidy the open browser tabs of one window into groups that belong together by topic or task.',
  `Give at most ${MAX_PROPOSALS} groups, each with a short name and the ids of its tabs.`,
  'Leave out tabs that fit no group. Use only the ids given, and each id at most once.',
].join('\n');

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Same host with three or more tabs, the biggest first. Needs no model. */
function ruleGroups(tabs: TidyTab[]): TabProposal[] {
  const byHost = new Map<string, number[]>();
  for (const tab of tabs) {
    const host = hostOf(tab.url);
    if (host) byHost.set(host, [...(byHost.get(host) ?? []), tab.id]);
  }
  return [...byHost]
    .filter(([, ids]) => ids.length >= MIN_GROUP)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_PROPOSALS)
    .map(([name, tabIds]) => ({ name, tabIds }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Proposals naming at least two given tabs; a tab belongs to the first proposal that has it. */
export function parseProposals(raw: unknown, ids: ReadonlySet<number>): TabProposal[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.groups)) return null;
  const used = new Set<number>();
  const out: TabProposal[] = [];
  for (const candidate of raw.groups) {
    if (!isRecord(candidate) || !Array.isArray(candidate.tabIds)) continue;
    const own = [
      ...new Set(
        candidate.tabIds.filter(
          (id): id is number => typeof id === 'number' && ids.has(id) && !used.has(id),
        ),
      ),
    ];
    const name =
      typeof candidate.name === 'string'
        ? candidate.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
        : '';
    if (own.length < 2 || !name) continue;
    for (const id of own) used.add(id);
    out.push({ name, tabIds: own });
    if (out.length === MAX_PROPOSALS) break;
  }
  return out.length ? out : null;
}

/** Up to four proposals for at most 40 tabs: the model's when it answers, else the host rule. */
export async function proposeGroups(tabs: TidyTab[]): Promise<TabProposal[]> {
  const given = tabs.slice(0, MAX_TABS);
  if (given.length < 2) return [];
  const rule = ruleGroups(given);
  if (!(await readAiSettings()).tabs) return rule;

  const ids = given.map((tab) => tab.id);
  const known = new Set(ids);
  const input = given
    .map((tab) => `${tab.id} | ${hostOf(tab.url)} | ${tab.title.slice(0, MAX_TITLE)}`)
    .join('\n');
  const answer = await promptJson<TabProposal[]>({
    system: SYSTEM,
    input: `Tabs (id | site | title):\n${input}`,
    schema: tidySchema(ids),
    validate: (raw) => parseProposals(raw, known),
    priority: 'interactive',
    timeoutMs: TIDY_TIMEOUT_MS,
  });
  return answer ?? rule;
}
