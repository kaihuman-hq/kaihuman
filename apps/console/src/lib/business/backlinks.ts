import { wikilinkTargets } from '../../../../../packages/ui/src/LifeOS/Organisms/wiki-links';

/** Paths whose Markdown links to the client with `[[client:<slug>]]` (code examples don't count), sorted. */
export const clientBacklinks = (
  slug: string,
  contents: Readonly<Record<string, string>>,
): string[] =>
  Object.entries(contents)
    .filter(([, content]) => wikilinkTargets(content).includes(`client:${slug}`))
    .map(([path]) => path)
    .sort();
