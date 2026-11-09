import { githubProfileStore, githubService } from '@kaihuman/core';
import { githubContentFiles } from '../screens/file-editor-screen.js';

export type ImageSource = { kind: 'svg'; xml: string } | { kind: 'uri'; uri: string };

export interface ImageDeps {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
}

const defaultDeps: ImageDeps = {
  readText: (path) => githubContentFiles.read(path),
  async readBytes(path) {
    const repo = githubProfileStore.currentRepo.peek();
    if (!repo) throw new Error('No repository selected');
    return githubService.getFileBytes(repo.owner.login, repo.name, path);
  },
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hand-rolled so it works without `btoa` or `Buffer` (Hermes lacks the latter). */
export const toBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63];
    out += c === undefined ? '=' : ALPHABET[n & 63];
  }
  return out;
};

export async function loadImage(
  path: string,
  mime: string,
  deps: ImageDeps = defaultDeps,
): Promise<ImageSource> {
  if (mime === 'image/svg+xml') return { kind: 'svg', xml: await deps.readText(path) };
  return { kind: 'uri', uri: `data:${mime};base64,${toBase64(await deps.readBytes(path))}` };
}
