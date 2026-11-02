/** The phase 1 fixture repo as text, keyed `.kh/business/<rel>`. Test support only. */
const raw = import.meta.glob('../../../../../packages/formats/fixtures/business/repo/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const MARKER = '/fixtures/business/repo/';

export const loadFixtureRepo = (): Map<string, string> =>
  new Map(
    Object.entries(raw)
      .map(([key, text]): [string, string] => [
        `.kh/business/${key.slice(key.indexOf(MARKER) + MARKER.length)}`,
        text,
      ])
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
