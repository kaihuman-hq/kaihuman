import { sha1 } from '@noble/hashes/sha1';
import { bytesToHex } from '@noble/hashes/utils';

/** The SHA git gives a blob with this content: sha1 over `blob <bytes>\0` + the raw bytes (UTF-8 for text). */
export function gitBlobSha(content: string | Uint8Array): string {
  const body = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return bytesToHex(sha1(all));
}
