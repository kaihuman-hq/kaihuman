import { encryptShareBlob, newShareKey } from '@kaihuman/formats/share';
import { describe, expect, it } from 'vitest';
import { inlinedDecrypt } from './testing/page.js';
import { makeWorld } from './testing/world.js';

type Decrypt = (blob: Uint8Array, key: string) => Promise<Uint8Array>;

describe('share round trip', () => {
  it('decrypts the served blob with the function inlined in the landing page', async () => {
    const world = makeWorld();
    const key = newShareKey();
    const plain = new TextEncoder().encode('<Invoice>2026-001 · 1.190,00 €</Invoice>');

    const uploaded = await world.upload(0, {
      body: await encryptShareBlob(plain, key),
      headers: { 'X-KH-Kind': 'xml', 'X-KH-Label': '2026-001' },
    });
    expect(uploaded.status).toBe(201);
    const { token } = (await uploaded.json()) as { token: string };

    const landing = await world.visit('GET', `/d/${token}`);
    const html = await landing.text();
    expect(html).not.toContain(key);
    const blob = await world.visit('GET', `/d/${token}/blob`);
    const cipher = new Uint8Array(await blob.arrayBuffer());

    const decrypt = new Function(`return (${inlinedDecrypt(html)});`)() as Decrypt;
    expect(await decrypt(cipher, key)).toEqual(plain);
  });
});
