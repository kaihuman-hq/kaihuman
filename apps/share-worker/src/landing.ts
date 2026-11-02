/**
 * The page a share link opens. It shows what was shared and decrypts the file in the browser:
 * the key is in the URL fragment, which browsers never send, and the page script hands it only
 * to the inlined `decryptShareBlob`. Rendering the page never counts and never writes, because
 * email scanners open links before people do.
 */

import { decryptShareBlob } from '@kaihuman/formats/share';
import type { FileRow } from './db.js';
import { GONE, NOT_FOUND, openLink } from './download.js';
import type { Deps, Env } from './env.js';
import { html } from './respond.js';

const DECRYPT = decryptShareBlob.toString();
// The function is inlined verbatim into a <script>; these sequences would end it early.
if (/<\/script|<!--/i.test(DECRYPT)) throw new Error('decryptShareBlob cannot be inlined');

const MIME: Record<FileRow['kind'], string> = { pdf: 'application/pdf', xml: 'application/xml' };

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** JSON that is safe inside a <script> element and as a JavaScript literal. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function csp(nonce: string | null): string {
  const script = nonce ? `'nonce-${nonce}'` : `'none'`;
  return `default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f5; --fg: #1d1d1b; --muted: #5f5f5a; --card: #fff; --accent: #1d4ed8; --accent-fg: #fff; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ededeb; --muted: #a3a39e; --card: #222220; --accent: #8fb0ff; --accent-fg: #0b1a3a; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: 100%; max-width: 32rem; background: var(--card); border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
h1 { font-size: 1.25rem; margin: 0 0 8px; overflow-wrap: anywhere; }
p { margin: 0 0 16px; overflow-wrap: anywhere; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 10px 20px; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
button:disabled { opacity: 0.6; cursor: progress; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#status { min-height: 1.5em; margin-top: 12px; }
.small { font-size: 0.875rem; color: var(--muted); }
a { color: inherit; }
`;

function htmlDocument(title: string, body: string, nonce: string | null, script = ''): string {
  const scriptTag = nonce ? `\n<script nonce="${nonce}">${script}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>${scriptTag}
</body>
</html>
`;
}

/**
 * The page script. The key is read from the fragment and passed only to decryptShareBlob;
 * the single fetch goes to this page's own `/blob` path.
 */
function pageScript(file: FileRow): string {
  const meta = scriptJson({ filename: `${file.label}.${file.kind}`, type: MIME[file.kind] });
  return `
(() => {
  const meta = ${meta};
  ${DECRYPT}
  const button = document.getElementById('download');
  const status = document.getElementById('status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Decrypting…';
    try {
      const key = location.hash.slice(1);
      if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('incomplete link');
      const response = await fetch(location.pathname + '/blob', {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('unavailable');
      const plain = await decryptShareBlob(new Uint8Array(await response.arrayBuffer()), key);
      const url = URL.createObjectURL(new Blob([plain], { type: meta.type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Downloaded ' + meta.filename + '.';
    } catch {
      status.textContent = 'This link is incomplete or the file is damaged.';
    } finally {
      button.disabled = false;
    }
  });
})();
`;
}

function linkPage(file: FileRow, token: string, abuseEmail: string, nonce: string): string {
  const label = escapeHtml(file.label);
  const business = escapeHtml(file.business);
  const abuse = escapeHtml(`mailto:${abuseEmail}?subject=Abuse%20report%20${token}`);
  const body = `<h1>${label}</h1>
<p>${business} shared ${label} with you.</p>
<button id="download" type="button">Download</button>
<noscript><p>Downloading needs JavaScript: the file is decrypted in your browser.</p></noscript>
<p id="status" role="status" aria-live="polite"></p>
<p class="small">The file is encrypted. Your browser decrypts it with the key at the end of this link; the key is never sent to the server.</p>
<p class="small"><a href="${abuse}">Report abuse</a></p>`;
  return htmlDocument(`${label} — shared via kaihuman`, body, nonce, pageScript(file));
}

function messagePage(request: Request, title: string, message: string, status: number): Response {
  const page = htmlDocument(`${title} — kaihuman`, `<h1>${message}</h1>`, null);
  return html(request, page, status, headers(null));
}

function headers(nonce: string | null): HeadersInit {
  return { 'Content-Security-Policy': csp(nonce), 'X-Robots-Tag': 'noindex' };
}

/** `GET` and `HEAD /d/:token` (token null when malformed): reads only, writes nothing. */
export async function landingPage(
  request: Request,
  env: Env,
  token: string | null,
  deps: Deps,
): Promise<Response> {
  const link = token ? await openLink(env, token, deps.now()) : ({ state: 'missing' } as const);
  if (link.state === 'missing') return messagePage(request, 'Link not found', NOT_FOUND, 404);
  if (link.state === 'gone') return messagePage(request, 'Link unavailable', GONE, 410);
  const nonce = newNonce();
  const page = linkPage(link.file, link.file.token, env.ABUSE_EMAIL, nonce);
  return html(request, page, 200, headers(nonce));
}
