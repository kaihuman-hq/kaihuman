import { decryptShareBlob, encryptShareBlob, newShareKey } from '@kaihuman/formats/share';
import { describe, expect, it } from 'vitest';
import { SQL } from './db.js';
import { inlinableDecrypt } from './landing.js';
import { inlineScript, runPage } from './testing/page.js';
import { makeWorld, tokenOf, type World } from './testing/world.js';

const TOKEN = tokenOf('a');
const PAGE = `/d/${TOKEN}`;
const INCOMPLETE = 'This link is incomplete or the file is damaged.';

async function page(world: World, method = 'GET', path = PAGE) {
  const response = await world.visit(method, path);
  return { response, text: await response.text() };
}

function snapshot(world: World) {
  return {
    files: structuredClone(world.db.tables.files),
    events: structuredClone(world.db.tables.events),
    objects: new Map(world.files.objects),
  };
}

describe('GET /d/:token', () => {
  it('shows the escaped label and business with a download button and an abuse link', async () => {
    const world = makeWorld();
    world.seedFile({
      token: TOKEN,
      user_id: 101,
      label: '<i>x</i>',
      business: 'Tom & "Jerry" <Co>',
    });

    const { response, text } = await page(world);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(text).toContain('<title>&lt;i&gt;x&lt;/i&gt; — shared via kaihuman</title>');
    expect(text).toContain(
      'Tom &amp; &quot;Jerry&quot; &lt;Co&gt; shared &lt;i&gt;x&lt;/i&gt; with you.',
    );
    expect(text).not.toContain('<i>x</i>');
    expect(text).not.toContain('<Co>');
    expect(text).toMatch(/<button id="download" type="button">Download<\/button>/);
    expect(text).toContain(
      `<a href="mailto:abuse@kaihuman.com?subject=Abuse%20report%20${TOKEN}">Report abuse</a>`,
    );
  });

  it('inlines decryptShareBlob in a nonce script allowed by a strict CSP', async () => {
    const world = makeWorld();
    world.seedFile({ token: TOKEN, user_id: 101 });

    const { response, text } = await page(world);
    const { nonce, source } = inlineScript(text);

    expect(source).toContain(decryptShareBlob.toString());
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(response.headers.get('Content-Security-Policy')).toBe(
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const again = inlineScript((await page(world)).text);
    expect(again.nonce).not.toBe(nonce);
  });

  it('embeds label and kind as JSON that cannot break out of the script', async () => {
    const world = makeWorld();
    const label = '</script><script>alert(1)</script>&\u2028\u2029';
    world.seedFile({ token: TOKEN, user_id: 101, label, kind: 'xml' });

    const { text } = await page(world);
    const { source } = inlineScript(text);

    expect(source).not.toMatch(/<\/script|<!--|\u2028|\u2029/i);
    const embedded = /const meta = (\{.*?\});/.exec(source)?.[1] ?? '';
    expect(JSON.parse(embedded)).toEqual({
      filename: `${label}.xml`,
      type: 'application/xml',
    });
  });

  it('records nothing and changes nothing for GET and HEAD (Review Focus 2)', async () => {
    const world = makeWorld();
    world.seedFile({ token: TOKEN, user_id: 101 });
    const before = snapshot(world);

    const get = await page(world, 'GET');
    const head = await page(world, 'HEAD');

    expect(get.response.status).toBe(200);
    expect(head.response.status).toBe(200);
    expect(head.text).toBe('');
    for (const name of ['Content-Security-Policy', 'X-Robots-Tag', 'Referrer-Policy']) {
      expect(head.response.headers.get(name)).toBeTruthy();
    }
    expect(head.response.headers.get('Cache-Control')).toBe('no-store');
    expect(world.db.statements).toEqual([SQL.findFile, SQL.findFile]);
    expect(snapshot(world)).toEqual(before);
    expect(world.db.tables.events).toEqual([]);
  });

  it('answers an unknown or malformed token with 404 This link does not exist.', async () => {
    const world = makeWorld();
    for (const path of [PAGE, '/d/short', `/d/${'!'.repeat(22)}`]) {
      const { response, text } = await page(world, 'GET', path);
      expect(response.status).toBe(404);
      expect(text).toContain('This link does not exist.');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(text).not.toContain('<script');
    }
    const head = await page(world, 'HEAD');
    expect(head.response.status).toBe(404);
    expect(head.text).toBe('');
  });

  it('answers revoked and expired links with 410 This link is no longer available.', async () => {
    const world = makeWorld();
    world.seedFile({ token: tokenOf('r'), user_id: 101, revoked_at: '2026-11-01T00:00:00.000Z' });
    world.seedFile({ token: tokenOf('e'), user_id: 101, expires_at: '2026-11-01' });
    world.seedFile({ token: tokenOf('t'), user_id: 101, expires_at: '2026-11-02' });
    const before = snapshot(world);

    for (const c of ['r', 'e']) {
      const { response, text } = await page(world, 'GET', `/d/${tokenOf(c)}`);
      expect(response.status).toBe(410);
      expect(text).toContain('This link is no longer available.');
      expect(text).not.toContain('Download');
    }
    // Expires at the end of its day (UTC): still open today.
    expect((await page(world, 'GET', `/d/${tokenOf('t')}`)).response.status).toBe(200);
    world.clock.now = Date.parse('2026-11-03T00:00:00.000Z');
    expect((await page(world, 'GET', `/d/${tokenOf('t')}`)).response.status).toBe(410);
    expect(snapshot(world)).toEqual(before);
  });

  it('refuses other methods with 405', async () => {
    const world = makeWorld();
    world.seedFile({ token: TOKEN, user_id: 101 });
    const response = await world.visit('POST', PAGE);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe('landing page script (Review Focus 1)', () => {
  async function setUp(label = '2026-001') {
    const world = makeWorld();
    const key = newShareKey();
    const plain = new TextEncoder().encode('%PDF-1.7 invoice');
    const blob = await encryptShareBlob(plain, key);
    const file = world.seedFile({ token: TOKEN, user_id: 101, label }, blob);
    const { text } = await page(world);
    const answer = (url: string) => world.visit('GET', url);
    return { file, key, plain, text, answer };
  }

  it('fetches only /d/<token>/blob, never with the key, and saves the decrypted file', async () => {
    const { key, plain, text, answer } = await setUp();

    const run = runPage(text, { pathname: PAGE, hash: `#${key}` }, answer);
    await run.download();

    expect(run.fetches).toHaveLength(1);
    expect(run.fetches[0]?.url).toBe(`/d/${TOKEN}/blob`);
    expect(JSON.stringify(run.fetches)).not.toContain(key);
    expect(run.saved).toHaveLength(1);
    expect(run.saved[0]?.name).toBe('2026-001.pdf');
    expect(run.saved[0]?.blob.type).toBe('application/pdf');
    expect(new Uint8Array(await (run.saved[0]?.blob as Blob).arrayBuffer())).toEqual(plain);
    expect(run.status.textContent).not.toBe(INCOMPLETE);
  });

  it('reads the key only from location.hash and passes it only to decryptShareBlob', async () => {
    const { text } = await setUp();
    const { source } = inlineScript(text);
    const own = source.replace(decryptShareBlob.toString(), '');

    expect(own.match(/fetch\(/g)).toHaveLength(1);
    expect(own).toContain("fetch(location.pathname + '/blob'");
    expect(own.match(/location\.hash/g)).toHaveLength(1);
    expect(own).toContain('const key = location.hash.slice(1);');
    expect(own.match(/\bkey\b/g)).toHaveLength(3);
    expect(own).toContain('decryptShareBlob(new Uint8Array(await response.arrayBuffer()), key)');
    expect(own).not.toMatch(/console\.|sendBeacon|XMLHttpRequest|localStorage|\.src\s*=/);
  });

  it('shows the incomplete message without fetching when the key is missing', async () => {
    const { text, answer } = await setUp();
    const run = runPage(text, { pathname: PAGE, hash: '' }, answer);
    await run.download();
    expect(run.fetches).toEqual([]);
    expect(run.status.textContent).toBe(INCOMPLETE);
    expect(run.saved).toEqual([]);
  });

  it('shows the incomplete message for a wrong key or a failed fetch', async () => {
    const { file, key, text, answer } = await setUp();
    const wrong = runPage(text, { pathname: PAGE, hash: `#${newShareKey()}` }, answer);
    await wrong.download();
    expect(wrong.status.textContent).toBe(INCOMPLETE);
    expect(wrong.saved).toEqual([]);
    expect(wrong.button.disabled).toBe(false);

    file.revoked_at = '2026-11-02T10:00:00.000Z';
    const gone = runPage(text, { pathname: PAGE, hash: `#${key}` }, answer);
    await gone.download();
    expect(gone.status.textContent).toBe(INCOMPLETE);
  });
});

describe('inlinableDecrypt (module-load guard)', () => {
  it('accepts the real decryptShareBlob source', () => {
    const source = decryptShareBlob.toString();
    expect(inlinableDecrypt(source)).toBe(source);
  });

  it('refuses a renamed, non-async or unsafe source, which the page script could not call', () => {
    for (const source of [
      'async function decryptShareBlob2(blob, key) {}',
      'function decryptShareBlob(blob, key) {}',
      'async (blob, key) => {}',
      'async function decryptShareBlob(blob, key) { "</script>" }',
      'async function decryptShareBlob(blob, key) { "<!--" }',
    ]) {
      expect(() => inlinableDecrypt(source)).toThrow('decryptShareBlob cannot be inlined');
    }
  });
});
