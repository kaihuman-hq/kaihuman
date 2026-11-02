/** `GET /api/events`: the caller's download events, for the console to record in the repo. */

import { listEvents } from './db.js';
import type { Env } from './env.js';
import { error, json } from './respond.js';

const MAX_EVENTS = 500;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `since` as the stored form (`Date#toISOString`), so string comparison in SQL is time
 * order; null when it is not an ISO instant.
 */
function normaliseSince(raw: string | null): string | null {
  if (raw === null) return '';
  if (!INSTANT.test(raw)) return null;
  // Date.parse rolls impossible days such as 31 April over instead of refusing them.
  const day = raw.slice(0, 10);
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(dayMs) || new Date(dayMs).toISOString().slice(0, 10) !== day) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export async function listOwnEvents(request: Request, env: Env, userId: number): Promise<Response> {
  const since = normaliseSince(new URL(request.url).searchParams.get('since'));
  if (since === null) return error('Invalid since.', 400);
  const rows = await listEvents(env.DB, userId, since, MAX_EVENTS);
  return json({
    events: rows.map((row) => ({
      id: row.id,
      token: row.token,
      label: row.label,
      at: row.at,
      client: row.client,
    })),
  });
}
