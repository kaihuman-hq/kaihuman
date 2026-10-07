import { type CollectionEntry, getCollection } from 'astro:content';

export type DocPage = {
  entry: CollectionEntry<'docs'>;
  title: string;
  summary: string;
};

/** All docs pages in file order (the numeric filename prefix sets the order). */
export async function getDocPages(): Promise<DocPage[]> {
  const entries = await getCollection('docs');
  return entries
    .sort((a, b) => (a.filePath ?? '').localeCompare(b.filePath ?? ''))
    .map((entry) => {
      const body = entry.body ?? '';
      const title = body.match(/^# (.+)$/m)?.[1] ?? entry.id;
      const summary = body.split(/\n{2,}/)[1]?.trim() ?? '';
      return { entry, title, summary };
    });
}
