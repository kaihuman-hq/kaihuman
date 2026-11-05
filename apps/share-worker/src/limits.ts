/** Size, quota and rate limits, parsed from the worker vars. */

import type { Env } from './env.js';

/** AES-GCM adds a 12-byte IV and a 16-byte tag to the plaintext. */
export const CIPHER_OVERHEAD = 28;
export const RATE_WINDOW_MS = 60 * 60_000;
export const TOO_MANY_UPLOADS = 'Too many uploads. Try again later.';

export interface Limits {
  /** Largest accepted ciphertext. */
  maxCipherBytes: number;
  maxPlainBytes: number;
  quotaBytes: number;
  uploadsPerHour: number;
}

function positiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

export function limitsOf(env: Env): Limits {
  const maxPlainBytes = positiveInt('MAX_BYTES', env.MAX_BYTES);
  return {
    maxPlainBytes,
    maxCipherBytes: maxPlainBytes + CIPHER_OVERHEAD,
    quotaBytes: positiveInt('QUOTA_BYTES', env.QUOTA_BYTES),
    uploadsPerHour: positiveInt('UPLOADS_PER_HOUR', env.UPLOADS_PER_HOUR),
  };
}

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_048_576)} MB`;

export const tooLarge = (limits: Limits): string =>
  `File too large (max ${megabytes(limits.maxPlainBytes)}).`;

export const quotaReached = (limits: Limits): string =>
  `Storage limit reached (${megabytes(limits.quotaBytes)}).`;

export const fitsQuota = (used: number, size: number, limits: Limits): boolean =>
  used + size <= limits.quotaBytes;

/** `recent` is the number of files created in the last hour, before this one. */
export const withinRate = (recent: number, limits: Limits): boolean =>
  recent < limits.uploadsPerHour;
