/**
 * In-memory stand-ins for the D1 and R2 subsets in `env.ts`. The fake D1 runs only the
 * statements in `SQL` (anything else throws), each re-implemented over plain arrays, so a
 * new query needs a matching handler here.
 */

import { type EventListRow, type EventRow, type FileListRow, type FileRow, SQL } from '../db.js';
import type { D1Database, D1PreparedStatement, D1Result, R2Bucket, R2ObjectBody } from '../env.js';

export interface Tables {
  files: FileRow[];
  events: EventRow[];
}

interface Outcome {
  results: unknown[];
  changes: number;
}

type Handler = (params: unknown[], tables: Tables) => Outcome;

const rows = (results: unknown[]): Outcome => ({ results, changes: 0 });

const byNewest = (a: FileRow, b: FileRow): number =>
  a.created_at === b.created_at
    ? a.token.localeCompare(b.token)
    : a.created_at < b.created_at
      ? 1
      : -1;

/** In place, so tests holding a table keep seeing it; returns how many rows went. */
function removeWhere<T>(table: T[], match: (row: T) => boolean): number {
  const kept = table.filter((row) => !match(row));
  const removed = table.length - kept.length;
  table.splice(0, table.length, ...kept);
  return removed;
}

const handlers: Record<string, Handler> = {
  [SQL.insertFile]: (p, t) => {
    const [token, user_id, label, business, kind, size, created_at, expires_at] = p as [
      string,
      number,
      string,
      string,
      FileRow['kind'],
      number,
      string,
      string | null,
    ];
    if (t.files.some((f) => f.token === token)) {
      throw new Error('UNIQUE constraint failed: files.token');
    }
    t.files.push({
      token,
      user_id,
      label,
      business,
      kind,
      size,
      created_at,
      expires_at,
      revoked_at: null,
    });
    return { results: [], changes: 1 };
  },
  [SQL.usedBytes]: ([userId], t) =>
    rows([
      {
        used: t.files
          .filter((f) => f.user_id === userId && f.revoked_at === null)
          .reduce((sum, f) => sum + f.size, 0),
      },
    ]),
  [SQL.uploadsSince]: ([userId, since], t) =>
    rows([
      {
        n: t.files.filter((f) => f.user_id === userId && f.created_at > (since as string)).length,
      },
    ]),
  [SQL.listFiles]: ([userId], t) =>
    rows(
      t.files
        .filter((f) => f.user_id === userId)
        .sort(byNewest)
        .map(
          (f): FileListRow => ({
            token: f.token,
            label: f.label,
            kind: f.kind,
            size: f.size,
            created_at: f.created_at,
            expires_at: f.expires_at,
            revoked_at: f.revoked_at,
            downloads: t.events.filter((e) => e.token === f.token).length,
          }),
        ),
    ),
  [SQL.revokeFile]: ([token, userId, at], t) => {
    const hits = t.files.filter((f) => f.token === token && f.user_id === userId);
    for (const f of hits) f.revoked_at ??= at as string;
    return { results: [], changes: hits.length };
  },
  [SQL.findFile]: ([token], t) => rows(t.files.filter((f) => f.token === token)),
  [SQL.insertEvent]: (p, t) => {
    const [id, token, user_id, at, client] = p as [
      string,
      string,
      number,
      string,
      EventRow['client'],
    ];
    if (t.events.some((e) => e.id === id)) throw new Error('UNIQUE constraint failed: events.id');
    t.events.push({ id, token, user_id, at, client });
    return { results: [], changes: 1 };
  },
  [SQL.listEvents]: ([userId, since, limit], t) =>
    rows(
      t.events
        .filter((e) => e.user_id === userId && e.at > (since as string))
        .flatMap((e): EventListRow[] => {
          const file = t.files.find((f) => f.token === e.token && f.user_id === e.user_id);
          return file
            ? [{ id: e.id, token: e.token, label: file.label, at: e.at, client: e.client }]
            : [];
        })
        .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1))
        .slice(0, limit as number),
    ),
  [SQL.fileTokens]: ([userId], t) =>
    rows(t.files.filter((f) => f.user_id === userId).map((f) => ({ token: f.token }))),
  [SQL.deleteEvents]: ([userId], t) => ({
    results: [],
    changes: removeWhere(t.events, (e) => e.user_id === userId),
  }),
  [SQL.deleteFiles]: ([userId], t) => ({
    results: [],
    changes: removeWhere(t.files, (f) => f.user_id === userId),
  }),
};

class FakeStatement implements D1PreparedStatement {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly handler: Handler,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new FakeStatement(this.db, this.sql, this.handler, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.exec().results[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.exec() as D1Result<T>;
  }

  async run(): Promise<D1Result<never>> {
    return { ...this.exec(), results: [] };
  }

  private exec(): D1Result<unknown> {
    this.db.queries.push(this.params);
    this.db.statements.push(this.sql);
    // Copies, so a caller can never mutate the store through a returned row.
    const { results, changes } = this.handler(this.params, this.db.tables);
    return { results: structuredClone(results), meta: { changes } };
  }
}

export class FakeD1 implements D1Database {
  readonly tables: Tables = { files: [], events: [] };
  /** The bound parameters of every executed statement. */
  readonly queries: unknown[][] = [];
  /** The SQL of every executed statement, in order. */
  readonly statements: string[] = [];

  prepare(query: string): D1PreparedStatement {
    const handler = handlers[query];
    if (!handler) throw new Error(`FakeD1 does not implement: ${query}`);
    return new FakeStatement(this, query, handler);
  }
}

export class FakeR2 implements R2Bucket {
  readonly objects = new Map<string, Uint8Array>();

  async put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown> {
    this.objects.set(key, new Uint8Array(value.slice(0)));
    return {};
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    const copy = bytes.slice();
    return {
      size: copy.length,
      body: new Blob([copy]).stream(),
      arrayBuffer: async () => copy.buffer,
    };
  }

  /** Like R2, a missing key is not an error. */
  async delete(keys: string | string[]): Promise<void> {
    if (Array.isArray(keys) && keys.length > 1000) throw new Error('R2 deletes at most 1000 keys');
    for (const key of typeof keys === 'string' ? [keys] : keys) this.objects.delete(key);
  }
}
