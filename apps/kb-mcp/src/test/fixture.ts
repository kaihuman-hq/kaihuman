import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Creates a temp repo containing the given files (paths relative to the repo root). */
export async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-mcp-'));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

export const SAMPLE_KB: Record<string, string> = {
  '.kh/wiki/react-hooks.md': [
    '---',
    'title: React Hooks',
    'type: concept',
    'tags: [react, frontend]',
    'sources: [raw/processed/1-hooks.md]',
    'created: 2026-04-01',
    'updated: 2026-04-05',
    '---',
    '',
    '# React Hooks',
    '',
    'Hooks such as useState. Built with [[Vite]].',
  ].join('\n'),
  '.kh/wiki/vite.md': [
    '---',
    'title: Vite',
    'type: entity',
    'tags: [build]',
    'updated: 2026-04-02',
    '---',
    '',
    'Vite is a build tool. See [[react-hooks]].',
  ].join('\n'),
  '.kh/wiki/state.md': [
    '---',
    'title: State Management',
    'type: topic',
    'tags: [react]',
    '---',
    '',
    'Relates to [[React Hooks|hooks]] and [[vite]].',
  ].join('\n'),
  '.kh/index.kb.md': '# Index\n\n- [[React Hooks]]\n- [[Vite]]\n',
  '.kh/log.md': [
    '# Log',
    '',
    '## [2026-04-01] ingest | Hooks article',
    'Created react-hooks.',
    '',
    '## [2026-04-02] ingest | Vite docs',
    'Created vite.',
  ].join('\n'),
};
