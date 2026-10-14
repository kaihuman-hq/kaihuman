import { type GithubRef, githubKey } from '@kaihuman/formats';
import { INBOX_QUERIES, MY_OPEN_PRS_QUERY } from './queries.js';
import { githubHttpError } from './repo-file.js';
import type {
  CiState,
  InboxReason,
  OrgAccessProblem,
  PinnedStatus,
  ReviewState,
  WorkItemStatus,
  WorkSnapshot,
} from './types.js';

export const MAX_LOOKUPS_PER_QUERY = 50;

const GRAPHQL_URL = 'https://api.github.com/graphql';

type SearchKey = InboxReason | 'mine';

// Aliases of the six searches in the query; a fixed table, never built from input.
const SEARCHES: [SearchKey, string, string][] = [
  ['review-requested', 'reviewRequested', INBOX_QUERIES['review-requested']],
  ['assigned', 'assigned', INBOX_QUERIES.assigned],
  ['failing', 'failing', INBOX_QUERIES.failing],
  ['changes-requested', 'changesRequested', INBOX_QUERIES['changes-requested']],
  ['ready-to-merge', 'readyToMerge', INBOX_QUERIES['ready-to-merge']],
  ['mine', 'mine', MY_OPEN_PRS_QUERY],
];

const NODE_FIELDS = `
  __typename
  ... on PullRequest {
    number title url state updatedAt isDraft reviewDecision mergeable
    repository { owner { login } name }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  }
  ... on Issue {
    number title url state updatedAt
    repository { owner { login } name }
  }`;

const searchBlock = ([, alias, q]: [SearchKey, string, string]) =>
  `${alias}: search(query: ${JSON.stringify(q)}, type: ISSUE, first: 50) { nodes { ${NODE_FIELDS} } }`;

export function buildWorkQueries(
  pinned: GithubRef[],
): { query: string; variables: Record<string, string | number> }[] {
  const chunks: GithubRef[][] = [];
  for (let i = 0; i < pinned.length; i += MAX_LOOKUPS_PER_QUERY) {
    chunks.push(pinned.slice(i, i + MAX_LOOKUPS_PER_QUERY));
  }
  if (chunks.length === 0) chunks.push([]);

  return chunks.map((chunk, c) => {
    const variables: Record<string, string | number> = {};
    const decls: string[] = [];
    const lookups: string[] = [];
    chunk.forEach((ref, i) => {
      variables[`o${i}`] = ref.owner;
      variables[`r${i}`] = ref.repo;
      variables[`n${i}`] = ref.number;
      decls.push(`$o${i}: String!`, `$r${i}: String!`, `$n${i}: Int!`);
      lookups.push(
        `p${i}: repository(owner: $o${i}, name: $r${i}) { issueOrPullRequest(number: $n${i}) { ${NODE_FIELDS} } }`,
      );
    });
    const head = c === 0 ? ['viewer { login }', ...SEARCHES.map(searchBlock)] : [];
    const body = [...head, ...lookups].join('\n');
    return {
      query: `query Work${decls.length ? `(${decls.join(', ')})` : ''} {\n${body}\n}`,
      variables,
    };
  });
}

interface GraphqlError {
  type?: string;
  message?: string;
  path?: unknown[];
}

interface RawNode {
  __typename?: string;
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  updatedAt?: string;
  isDraft?: boolean;
  reviewDecision?: string | null;
  mergeable?: string;
  repository?: { owner?: { login?: string }; name?: string };
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] };
}

const CI: Record<string, CiState> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

function toStatus(node: RawNode): WorkItemStatus | null {
  const owner = node.repository?.owner?.login;
  const name = node.repository?.name;
  if (
    !owner ||
    !name ||
    typeof node.number !== 'number' ||
    (node.__typename !== 'PullRequest' && node.__typename !== 'Issue')
  ) {
    return null;
  }
  const pr = node.__typename === 'PullRequest';
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  return {
    key: githubKey(owner, name, node.number),
    url: node.url ?? '',
    repo: `${owner}/${name}`,
    number: node.number,
    kind: pr ? 'pr' : 'issue',
    title: node.title ?? '',
    state: (node.state ?? 'OPEN').toLowerCase() as WorkItemStatus['state'],
    isDraft: pr && node.isDraft === true,
    review: pr && node.reviewDecision ? (node.reviewDecision.toLowerCase() as ReviewState) : null,
    ci: pr && rollup ? (CI[rollup] ?? null) : null,
    conflict: pr && node.mergeable === 'CONFLICTING',
    updatedAt: node.updatedAt ?? '',
  };
}

export function parseWorkResponses(
  responses: unknown[],
  pinned: GithubRef[],
): {
  login: string;
  searches: WorkSnapshot['searches'];
  pinned: Record<string, PinnedStatus>;
  orgProblems: OrgAccessProblem[];
} {
  type Body = { data?: Record<string, any> | null; errors?: GraphqlError[] };
  const bodies = responses as Body[];

  const searches = Object.fromEntries(
    SEARCHES.map(([k]) => [k, [] as WorkItemStatus[]]),
  ) as WorkSnapshot['searches'];
  const first = bodies[0]?.data;
  for (const [key, alias] of SEARCHES) {
    const nodes: RawNode[] = first?.[alias]?.nodes ?? [];
    searches[key] = nodes.map(toStatus).filter((s): s is WorkItemStatus => s !== null);
  }

  const result: Record<string, PinnedStatus> = {};
  const orgProblems: OrgAccessProblem[] = [];
  pinned.forEach((ref, index) => {
    const body = bodies[Math.floor(index / MAX_LOOKUPS_PER_QUERY)];
    const alias = `p${index % MAX_LOOKUPS_PER_QUERY}`;
    const found = body?.data?.[alias]?.repository?.issueOrPullRequest as RawNode | null | undefined;
    const status = found ? toStatus(found) : null;
    if (status) {
      result[ref.key] = status;
      return;
    }
    const error = body?.errors?.find((e) => e.path?.[0] === alias && e.type === 'FORBIDDEN');
    if (!error) {
      result[ref.key] = { key: ref.key, error: 'not-found', org: ref.owner };
      return;
    }
    result[ref.key] = { key: ref.key, error: 'forbidden', org: ref.owner };
    if (!orgProblems.some((p) => p.org === ref.owner)) {
      const sso = /SAML/i.test(error.message ?? '');
      orgProblems.push(
        sso
          ? { org: ref.owner, fix: 'sso', url: `https://github.com/orgs/${ref.owner}/sso` }
          : { org: ref.owner, fix: 'oauth', url: 'https://github.com/settings/applications' },
      );
    }
  });

  return { login: first?.viewer?.login ?? '', searches, pinned: result, orgProblems };
}

export async function runWorkQueries(
  token: string,
  pinned: GithubRef[],
): Promise<ReturnType<typeof parseWorkResponses>> {
  const bodies: unknown[] = [];
  // Sequential on purpose: parallel GraphQL calls trip GitHub's secondary rate limit.
  for (const { query, variables } of buildWorkQueries(pinned)) {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw await githubHttpError(res, 'GitHub GraphQL failed');
    bodies.push(await res.json());
  }
  return parseWorkResponses(bodies, pinned);
}
