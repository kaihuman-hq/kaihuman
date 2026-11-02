// End-to-end share crypto. Dependency-free: runs in browsers, Node 20+ and Workers.
// Blob layout: iv (12 bytes) || AES-GCM ciphertext+tag. Key and token are base64url, no padding.

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid base64url');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomB64url(length: number): string {
  return b64urlEncode(globalThis.crypto.getRandomValues(new Uint8Array(length)));
}

export const newShareKey = (): string => randomB64url(32);
export const newShareToken = (): string => randomB64url(16);

export async function encryptShareBlob(plain: Uint8Array, key: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    'raw',
    b64urlDecode(key) as BufferSource,
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain as BufferSource),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

// Self-contained on purpose: the landing page inlines this function via `.toString()`,
// so it may not reference imports or module-level helpers. Keep it a plain async function.
export async function decryptShareBlob(blob: Uint8Array, key: string): Promise<Uint8Array> {
  try {
    const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    const raw = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.slice(0, 12) },
      cryptoKey,
      blob.slice(12),
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error('Wrong key or damaged file');
  }
}

export function shareUrl(host: string, token: string, key: string): string {
  return `${host.replace(/\/$/, '')}/d/${token}#${key}`;
}

export function parseShareUrl(url: string): { host: string; token: string; key: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^\/d\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
  const key = u.hash.slice(1);
  if (!m?.[1] || !key) return null;
  return { host: u.origin, token: m[1], key };
}
