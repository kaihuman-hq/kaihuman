import { sha1 } from '@noble/hashes/sha1';
import { bytesToHex } from '@noble/hashes/utils';

/** The SHA git gives a blob with this text: sha1 over `blob <bytes>\0` + the UTF-8 bytes. */
export function gitBlobSha(content: string): string {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return bytesToHex(sha1(all));
}
