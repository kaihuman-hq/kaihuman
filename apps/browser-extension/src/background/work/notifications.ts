import { type GithubKey, githubKey } from '@kaihuman/formats';
import { githubHttpError } from './repo-file.js';
import type { NotificationThread } from './types.js';

const API = 'https://api.github.com';
const DEFAULT_POLL_INTERVAL_SEC = 60;

const SUBJECT_URL = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)$/;

/** The work item a notification subject points at; null for commits, discussions, releases… */
export function subjectKey(subjectApiUrl: string | null): GithubKey | null {
  const match = subjectApiUrl ? SUBJECT_URL.exec(subjectApiUrl) : null;
  if (!match) return null;
  return githubKey(match[1], match[2], Number(match[4]));
}

export type NotificationsPoll =
  | { status: 'unchanged'; pollIntervalSec: number }
  | {
      status: 'changed';
      threads: NotificationThread[];
      lastModified: string | null;
      pollIntervalSec: number;
    };

interface ThreadPayload {
  id: string;
  reason: string;
  unread: boolean;
  updated_at: string;
  subject: { title: string; type: string; url: string | null };
  repository: { full_name: string };
}

const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
});

function toThread(raw: ThreadPayload): NotificationThread {
  const key = subjectKey(raw.subject.url);
  const repo = raw.repository.full_name;
  const match = raw.subject.url ? SUBJECT_URL.exec(raw.subject.url) : null;
  return {
    threadId: raw.id,
    key: key ?? `thread:${raw.id}`,
    reason: raw.reason,
    title: raw.subject.title,
    // The API URL is not a page; rebuild the HTML one, or fall back to the repo.
    url: match
      ? `https://github.com/${match[1]}/${match[2]}/${match[3] === 'pulls' ? 'pull' : 'issues'}/${match[4]}`
      : `https://github.com/${repo}`,
    repo,
    updatedAt: raw.updated_at,
    unread: raw.unread,
  };
}

/** Conditional poll of participating notifications; a 304 costs no rate limit. */
export async function pollNotifications(
  token: string,
  lastModified: string | null,
): Promise<NotificationsPoll> {
  const res = await fetch(`${API}/notifications?participating=true&per_page=50`, {
    headers: lastModified
      ? { ...headers(token), 'If-Modified-Since': lastModified }
      : headers(token),
  });
  const pollIntervalSec = Number(res.headers.get('x-poll-interval')) || DEFAULT_POLL_INTERVAL_SEC;
  if (res.status === 304) return { status: 'unchanged', pollIntervalSec };
  if (!res.ok) throw await githubHttpError(res, 'Fetching notifications');
  const raw = (await res.json()) as ThreadPayload[];
  return {
    status: 'changed',
    threads: raw.map(toThread),
    lastModified: res.headers.get('last-modified'),
    pollIntervalSec,
  };
}

async function threadRequest(
  method: 'DELETE' | 'PATCH',
  token: string,
  threadId: string,
  action: string,
): Promise<void> {
  const res = await fetch(`${API}/notifications/threads/${encodeURIComponent(threadId)}`, {
    method,
    headers: headers(token),
  });
  if (!res.ok) throw await githubHttpError(res, action);
}

export const markThreadDone = (token: string, threadId: string) =>
  threadRequest('DELETE', token, threadId, 'Marking notification done');

export const markThreadRead = (token: string, threadId: string) =>
  threadRequest('PATCH', token, threadId, 'Marking notification read');
