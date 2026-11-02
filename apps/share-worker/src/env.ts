/**
 * Bindings and the subset of the Cloudflare D1 and R2 APIs this worker uses. Declared here
 * instead of pulling in `@cloudflare/workers-types`, whose globals clash with the DOM lib;
 * `testing/fakes.ts` implements the same interfaces.
 */

export interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<never>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Runs the statements in one transaction: if one fails, none take effect. */
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2ObjectBody {
  readonly size: number;
  readonly body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  /** Up to 1000 keys per call; missing keys are not an error. */
  delete(keys: string | string[]): Promise<void>;
}

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  /** Comma-separated origins allowed to call `/api/*`, e.g. `https://app.kaihuman.com`. */
  CONSOLE_ORIGINS: string;
  QUOTA_BYTES: string;
  /** Largest plaintext; the ciphertext may be 28 bytes larger (IV + tag). */
  MAX_BYTES: string;
  UPLOADS_PER_HOUR: string;
  ABUSE_EMAIL: string;
}

/** What a request needs from the outside world; tests replace both. */
export interface Deps {
  fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/** The R2 key of a file: per user, so one user's prefix never holds another's object. */
export const objectKey = (userId: number, token: string): string => `${userId}/${token}`;
