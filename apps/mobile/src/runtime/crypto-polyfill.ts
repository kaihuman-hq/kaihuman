import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** Pure-JS subset of `crypto.subtle` for packages/core/src/utils/crypto.ts: PBKDF2-SHA256 -> AES-GCM-256. */

type Params = { name: string; [k: string]: unknown };
const algName = (a: string | Params): string => (typeof a === 'string' ? a : a.name);

const bytes = (data: BufferSource): Uint8Array =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const toArrayBuffer = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** Opaque key carrying raw bytes; only this polyfill ever sees it. */
interface PolyKey {
  type: 'secret';
  extractable: boolean;
  algorithm: Params;
  usages: string[];
  raw: Uint8Array;
}

const subtle = {
  async importKey(
    format: string,
    keyData: BufferSource,
    algorithm: string | Params,
    extractable: boolean,
    usages: string[],
  ): Promise<PolyKey> {
    if (format !== 'raw' || algName(algorithm) !== 'PBKDF2') {
      throw new Error('crypto polyfill: only raw PBKDF2 keys are supported');
    }
    return {
      type: 'secret',
      extractable,
      algorithm: { name: 'PBKDF2' },
      usages,
      raw: bytes(keyData).slice(),
    };
  },

  async deriveKey(
    algorithm: Params,
    baseKey: PolyKey,
    derived: Params,
    extractable: boolean,
    usages: string[],
  ): Promise<PolyKey> {
    if (algorithm.name !== 'PBKDF2' || algorithm.hash !== 'SHA-256') {
      throw new Error('crypto polyfill: only PBKDF2 with SHA-256 is supported');
    }
    if (derived.name !== 'AES-GCM') throw new Error('crypto polyfill: only AES-GCM is supported');
    const length = derived.length as number;
    const raw = await pbkdf2Async(sha256, baseKey.raw, bytes(algorithm.salt as BufferSource), {
      c: algorithm.iterations as number,
      dkLen: length / 8,
    });
    return { type: 'secret', extractable, algorithm: { ...derived }, usages, raw };
  },

  // Output is ciphertext || 16-byte tag, as in Web Crypto.
  async encrypt(algorithm: Params, key: PolyKey, data: BufferSource): Promise<ArrayBuffer> {
    const iv = bytes(algorithm.iv as BufferSource);
    return toArrayBuffer(gcm(key.raw, iv).encrypt(bytes(data)));
  },

  async decrypt(algorithm: Params, key: PolyKey, data: BufferSource): Promise<ArrayBuffer> {
    const iv = bytes(algorithm.iv as BufferSource);
    try {
      return toArrayBuffer(gcm(key.raw, iv).decrypt(bytes(data)));
    } catch {
      // Web Crypto rejects with an opaque OperationError; core surfaces it as "wrong passphrase".
      throw new Error('OperationError');
    }
  },
};

export interface CryptoPolyfillOptions {
  getRandomValues?: (array: Uint8Array) => unknown;
}

type CryptoLike = { subtle?: unknown; getRandomValues?: unknown };
type Target = { crypto?: CryptoLike; window?: unknown };

/** Installs `crypto.subtle` (and `window`/`getRandomValues` when absent). Returns true when it changed anything. */
export function installCryptoPolyfill(
  target: object = globalThis,
  options: CryptoPolyfillOptions = {},
): boolean {
  const t = target as Target;
  let changed = false;
  if (!t.crypto) {
    t.crypto = {};
    changed = true;
  }
  const c = t.crypto;
  if (!c.subtle) {
    Object.defineProperty(c, 'subtle', { value: subtle, configurable: true });
    changed = true;
  }
  if (!c.getRandomValues) {
    if (!options.getRandomValues) throw new Error('crypto polyfill: no getRandomValues source');
    Object.defineProperty(c, 'getRandomValues', {
      value: options.getRandomValues,
      configurable: true,
    });
    changed = true;
  }
  // Core calls `window.crypto`; on React Native `window` is the global already.
  if (t.window === undefined) {
    t.window = target;
    changed = true;
  }
  return changed;
}
