import { QuickCaptureController } from '../screens/quick-capture.js';
import type { LanguageModel } from './model.js';
import type { CaptureFiles } from './save-capture.js';

/** In-memory repo for the intelligence tests. */
export function memFiles(
  initial: Record<string, string> = {},
): CaptureFiles & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    appFolder: () => '.kh',
    exists: (p) => p in data,
    todoPaths: () => Object.keys(data).filter((p) => p.endsWith('.todos.md')),
    list: (suffix) => Object.keys(data).filter((p) => p.endsWith(suffix)),
    read: async (p) => data[p] ?? null,
    write: async (p, c) => {
      data[p] = c;
    },
  };
}

export const controllerFor = (files: CaptureFiles, now: Date) =>
  new QuickCaptureController(files, () => now);

/** A model that answers with fixed values; `null` targets are unavailable. */
export function fakeModel(opts: {
  device?: boolean;
  server?: boolean;
  json?: unknown | (() => never);
  text?: string | (() => never);
}): LanguageModel & { calls: { kind: string; target: string; prompt: string }[] } {
  const calls: { kind: string; target: string; prompt: string }[] = [];
  return {
    calls,
    available: (t) => (t === 'device' ? !!opts.device : !!opts.server),
    json: async (prompt, _i, _s, target) => {
      calls.push({ kind: 'json', target, prompt });
      return typeof opts.json === 'function' ? (opts.json as () => never)() : opts.json;
    },
    text: async (prompt, _i, target) => {
      calls.push({ kind: 'text', target, prompt });
      return typeof opts.text === 'function' ? (opts.text as () => never)() : (opts.text ?? '');
    },
  };
}
