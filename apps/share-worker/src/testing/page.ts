/**
 * Runs the landing page's inline script against a minimal fake DOM, so tests can click
 * Download and see exactly what the page fetches and saves.
 */

import { expect } from 'vitest';

export function inlineScript(html: string): { nonce: string; source: string } {
  const match = /<script nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(html);
  expect(match).not.toBeNull();
  const scripts = html.match(/<script\b/g) ?? [];
  expect(scripts).toHaveLength(1);
  return { nonce: match?.[1] ?? '', source: match?.[2] ?? '' };
}

/** The source of `async function decryptShareBlob(…) { … }` as inlined in the page. */
export function inlinedDecrypt(html: string): string {
  const { source } = inlineScript(html);
  const start = source.indexOf('async function decryptShareBlob(');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated decryptShareBlob');
}

interface FakeElement {
  textContent: string;
  disabled: boolean;
  href: string;
  download: string;
  clicked: number;
  listeners: Record<string, () => unknown>;
  addEventListener(type: string, listener: () => unknown): void;
  click(): void;
  remove(): void;
}

function element(): FakeElement {
  return {
    textContent: '',
    disabled: false,
    href: '',
    download: '',
    clicked: 0,
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    click() {
      this.clicked++;
    },
    remove() {},
  };
}

export interface PageRun {
  fetches: { url: string; init: unknown }[];
  saved: { name: string; blob: Blob }[];
  status: FakeElement;
  button: FakeElement;
  /** Clicks Download and waits for the handler to finish. */
  download(): Promise<void>;
}

/** Evaluates the page script with `location` at `path#hash`; `fetchImpl` answers its fetches. */
export function runPage(
  html: string,
  location: { pathname: string; hash: string },
  fetchImpl: (url: string) => Promise<Response>,
): PageRun {
  const { source } = inlineScript(html);
  const button = element();
  const status = element();
  const anchors: FakeElement[] = [];
  const blobs = new Map<string, Blob>();
  const run: PageRun = {
    fetches: [],
    saved: [],
    status,
    button,
    async download() {
      await button.listeners.click?.();
      for (const a of anchors) {
        const blob = blobs.get(a.href);
        if (a.clicked && blob) run.saved.push({ name: a.download, blob });
      }
    },
  };
  const document = {
    getElementById: (id: string) => ({ download: button, status })[id] ?? null,
    createElement: () => {
      const a = element();
      anchors.push(a);
      return a;
    },
    body: { append() {} },
  };
  const url = {
    createObjectURL(blob: Blob) {
      const id = `blob:test/${blobs.size}`;
      blobs.set(id, blob);
      return id;
    },
    revokeObjectURL() {},
  };
  const fetchSpy = (input: string, init?: unknown) => {
    run.fetches.push({ url: input, init });
    return fetchImpl(input);
  };
  const noTimers = () => 0;
  new Function('document', 'location', 'fetch', 'URL', 'setTimeout', source)(
    document,
    location,
    fetchSpy,
    url,
    noTimers,
  );
  return run;
}
