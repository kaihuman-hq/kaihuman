/** Slugs name clients and projects; ULIDs name everything that has no number of its own. */

/** Lowercase kebab-case, 2–40 characters. */
export type Slug = string & { __brand: 'Slug' };

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const asSlug = (s: string): Slug | null => (SLUG.test(s) ? (s as Slug) : null);

/** 26 Crockford base32 characters: 48 bits of time, then 80 bits of randomness. */
export type Ulid = string & { __brand: 'Ulid' };

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const isUlid = (s: string): s is Ulid => ULID.test(s);

export const newUlid = (nowMs: number, random: Uint8Array): Ulid => {
  if (random.length !== 10) throw new RangeError('a ULID needs exactly 10 random bytes');
  let time = BigInt(nowMs);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[Number(time & 31n)] + out;
    time >>= 5n;
  }
  let bits = 0n;
  for (const byte of random) bits = (bits << 8n) | BigInt(byte);
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[Number((bits >> BigInt(75 - i * 5)) & 31n)];
  }
  return out as Ulid;
};

export const ulid = (): Ulid => newUlid(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
