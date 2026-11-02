/**
 * Every statement the worker sends to D1, parameterised, plus typed wrappers. The fake D1 in
 * `testing/fakes.ts` implements exactly these statements, keyed by the `SQL` values.
 */

import type { D1Database } from './env.js';

export type Kind = 'pdf' | 'xml';

export interface FileRow {
  token: string;
  user_id: number;
  label: string;
  business: string;
  kind: Kind;
  size: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface EventRow {
  id: string;
  token: string;
  user_id: number;
  at: string;
  client: 'browser' | 'bot' | 'other';
}

export interface FileListRow extends Omit<FileRow, 'user_id'> {
  downloads: number;
}

export const SQL = {
  insertFile:
    'INSERT INTO files (token, user_id, label, business, kind, size, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
  usedBytes:
    'SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE user_id = ?1 AND revoked_at IS NULL',
  uploadsSince: 'SELECT COUNT(*) AS n FROM files WHERE user_id = ?1 AND created_at > ?2',
  listFiles:
    'SELECT f.token, f.label, f.business, f.kind, f.size, f.created_at, f.expires_at, f.revoked_at, (SELECT COUNT(*) FROM events e WHERE e.token = f.token) AS downloads FROM files f WHERE f.user_id = ?1 ORDER BY f.created_at DESC, f.token',
  // COALESCE keeps the first revoke time when a file is revoked twice.
  revokeFile:
    'UPDATE files SET revoked_at = COALESCE(revoked_at, ?3) WHERE token = ?1 AND user_id = ?2',
  findFile:
    'SELECT token, user_id, label, business, kind, size, created_at, expires_at, revoked_at FROM files WHERE token = ?1',
  insertEvent: 'INSERT INTO events (id, token, user_id, at, client) VALUES (?1, ?2, ?3, ?4, ?5)',
  // Joined on the owner too, so an event can only ever be listed with its owner's file.
  listEvents:
    'SELECT e.id, e.token, f.label, e.at, e.client FROM events e JOIN files f ON f.token = e.token AND f.user_id = e.user_id WHERE e.user_id = ?1 AND e.at > ?2 ORDER BY e.at, e.id LIMIT ?3',
  fileTokens: 'SELECT token FROM files WHERE user_id = ?1',
  deleteEvents: 'DELETE FROM events WHERE user_id = ?1',
  deleteFiles: 'DELETE FROM files WHERE user_id = ?1',
} as const;

export type Client = EventRow['client'];

export interface EventListRow extends Omit<EventRow, 'user_id'> {
  label: string;
}

export type NewFile = Omit<FileRow, 'revoked_at'>;

export async function insertFile(db: D1Database, file: NewFile): Promise<void> {
  await db
    .prepare(SQL.insertFile)
    .bind(
      file.token,
      file.user_id,
      file.label,
      file.business,
      file.kind,
      file.size,
      file.created_at,
      file.expires_at,
    )
    .run();
}

/** Bytes held by the user's files that are not revoked. */
export async function usedBytes(db: D1Database, userId: number): Promise<number> {
  const row = await db.prepare(SQL.usedBytes).bind(userId).first<{ used: number }>();
  return row?.used ?? 0;
}

/** Files the user created after `sinceIso`, revoked ones included. */
export async function uploadsSince(
  db: D1Database,
  userId: number,
  sinceIso: string,
): Promise<number> {
  const row = await db.prepare(SQL.uploadsSince).bind(userId, sinceIso).first<{ n: number }>();
  return row?.n ?? 0;
}

/** The user's files, newest first. */
export async function listFiles(db: D1Database, userId: number): Promise<FileListRow[]> {
  const { results } = await db.prepare(SQL.listFiles).bind(userId).all<FileListRow>();
  return results;
}

/** Marks the user's file revoked; false when the user has no file with that token. */
export async function revokeFile(
  db: D1Database,
  userId: number,
  token: string,
  atIso: string,
): Promise<boolean> {
  const { meta } = await db.prepare(SQL.revokeFile).bind(token, userId, atIso).run();
  return meta.changes > 0;
}

/** Any user's file by token: share links are public, so this lookup is not scoped. */
export async function findFile(db: D1Database, token: string): Promise<FileRow | null> {
  return db.prepare(SQL.findFile).bind(token).first<FileRow>();
}

export async function insertEvent(db: D1Database, event: EventRow): Promise<void> {
  await db
    .prepare(SQL.insertEvent)
    .bind(event.id, event.token, event.user_id, event.at, event.client)
    .run();
}

/** The user's download events after `sinceIso`, oldest first, at most `limit`. */
export async function listEvents(
  db: D1Database,
  userId: number,
  sinceIso: string,
  limit: number,
): Promise<EventListRow[]> {
  const { results } = await db
    .prepare(SQL.listEvents)
    .bind(userId, sinceIso, limit)
    .all<EventListRow>();
  return results;
}

/** Tokens of all the user's files, revoked ones included. */
export async function fileTokens(db: D1Database, userId: number): Promise<string[]> {
  const { results } = await db.prepare(SQL.fileTokens).bind(userId).all<{ token: string }>();
  return results.map((row) => row.token);
}

/** Removes every events and files row of the user, atomically: all or nothing. */
export async function deleteUserRows(db: D1Database, userId: number): Promise<void> {
  await db.batch([
    db.prepare(SQL.deleteEvents).bind(userId),
    db.prepare(SQL.deleteFiles).bind(userId),
  ]);
}
