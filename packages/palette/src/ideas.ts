/**
 * `>id` — ideas (doc/ideas.md, Decision 7): the repository's `.kh/ideas/<slug>.md` files.
 *
 * With nothing typed it lists the open ideas, most recently active first. Typing searches all of
 * them as `kaihuman ideas find` does, and offers **New idea: …** for a title no idea has yet;
 * `<slug>: <text>` offers **Log on <slug>: …** instead. Both write as `human`, the way a person
 * in the console does, so the log says who added what.
 */
import {
  findIdeas,
  type Idea,
  type IdeaSlug,
  ideaActivity,
  ideaSlugOf,
  logIdea,
  newIdea,
  OPEN_IDEA_STATUSES,
  parseIdea,
} from '@kaihuman/formats';
import type { ModeItem, PaletteMode } from './command-palette.js';
import type { ActionPort, IdeaFile } from './protocol.js';

/** What the palette writes as the author: the person typing, not an agent. */
export const IDEA_AUTHOR = 'human';

export interface ListedIdea {
  slug: IdeaSlug;
  idea: Idea;
  file: IdeaFile;
}

/** What is typed in `>id`: nothing, a log line for a known slug, or words to search or name. */
export type IdeaQuery =
  | { kind: 'list' }
  | { kind: 'log'; slug: IdeaSlug; text: string }
  | { kind: 'search'; text: string };

/** `palette-sync: tried CRDTs` is a log line only when `palette-sync` is an idea already. */
export const parseIdeaQuery = (query: string, known: ReadonlySet<string>): IdeaQuery => {
  const text = query.trim();
  if (!text) return { kind: 'list' };
  const match = /^([^\s:]+):\s*(\S[\s\S]*)$/.exec(text);
  const slug = match?.[1]?.toLowerCase() ?? '';
  if (match && known.has(slug)) {
    return { kind: 'log', slug: slug as IdeaSlug, text: match[2] ?? '' };
  }
  return { kind: 'search', text };
};

/** The files that are ideas, parsed; anything else a backend sent is left out. */
export const listedIdeas = (files: readonly IdeaFile[]): ListedIdea[] =>
  files.flatMap((file) => {
    const slug = ideaSlugOf(file.path);
    return slug ? [{ slug, idea: parseIdea(file.text), file }] : [];
  });

const ideaItem = ({ slug, idea, file }: ListedIdea): ModeItem => ({
  id: `idea:${slug}`,
  title: idea.title,
  subtitle: [idea.status, slug, idea.product].filter(Boolean).join(' · '),
  keywords: idea.tags.join(' '),
  url: file.url,
});

const newIdeaItem = (
  port: ActionPort,
  title: string,
  known: ReadonlySet<string>,
  now: () => Date,
): ModeItem => {
  const id = `idea:new:${title}`;
  return {
    id,
    title: `New idea: ${title}`,
    subtitle: 'Creates it as a seed in .kh/ideas/',
    action: {
      id,
      title: `New idea: ${title}`,
      recent: false,
      run: async () => {
        const { slug, path, content } = newIdea({ title }, { author: IDEA_AUTHOR, now: now() });
        // The backend would refuse it too; this says what to do instead.
        if (known.has(slug)) {
          throw new Error(`There is an idea ${slug} already — “${slug}: …” logs on it`);
        }
        await port.send({ type: 'SAVE_IDEA', path, content });
        return `New idea ${slug}`;
      },
    },
  };
};

const logItem = (port: ActionPort, entry: ListedIdea, text: string, now: () => Date): ModeItem => {
  const id = `idea:log:${entry.slug}`;
  return {
    id,
    title: `Log on ${entry.slug}: ${text}`,
    subtitle: entry.idea.title,
    action: {
      id,
      title: `Log on ${entry.slug}`,
      recent: false,
      run: async () => {
        const content = logIdea(entry.file.text, text, { author: IDEA_AUTHOR, now: now() });
        await port.send({
          type: 'SAVE_IDEA',
          path: entry.file.path,
          content,
          sha: entry.file.sha,
        });
        return `Logged on ${entry.slug}`;
      },
    },
  };
};

/** Newest activity first; ideas with none last, by slug. */
const byActivity = (ideas: readonly ListedIdea[], now: Date) =>
  ideas
    .map((entry) => ({ entry, at: ideaActivity(entry.idea, now).lastAt ?? -1 }))
    .sort((a, b) => b.at - a.at || a.entry.slug.localeCompare(b.entry.slug))
    .map(({ entry }) => entry);

/** What `>id` lists for `query`, given the ideas `LIST_IDEAS` answered. */
export const ideaItems = (
  port: ActionPort,
  ideas: readonly ListedIdea[],
  query: string,
  now: () => Date = () => new Date(),
): ModeItem[] => {
  const known = new Set<string>(ideas.map((entry) => entry.slug));
  const parsed = parseIdeaQuery(query, known);
  if (parsed.kind === 'list') {
    const open = ideas.filter((entry) => OPEN_IDEA_STATUSES.includes(entry.idea.status));
    return byActivity(open, now()).map(ideaItem);
  }
  if (parsed.kind === 'log') {
    const entry = ideas.find((candidate) => candidate.slug === parsed.slug);
    return entry ? [logItem(port, entry, parsed.text, now), ideaItem(entry)] : [];
  }
  const wanted = parsed.text.toLowerCase();
  const exact = ideas.some(
    (entry) => entry.slug === wanted || entry.idea.title.toLowerCase() === wanted,
  );
  const found = findIdeas([...ideas], parsed.text).flatMap((ref) => {
    const entry = ideas.find((candidate) => candidate.slug === ref.slug);
    return entry ? [ideaItem(entry)] : [];
  });
  return exact ? found : [newIdeaItem(port, parsed.text, known, now), ...found];
};

/** `>id` — on every surface; `>i` stays the default IMDb link tool. */
export const ideasMode = (port: ActionPort, now: () => Date = () => new Date()): PaletteMode => {
  let ideas: ListedIdea[] = [];
  return {
    prefix: 'id',
    title: 'Ideas',
    placeholder: 'Search ideas — ⏎ opens one; a new title makes a seed, “slug: text” logs on one',
    description:
      'The repository’s ideas (.kh/ideas/), open ones by last activity — ⏎ opens one in Kaihuman; typing a new title creates a seed idea, “slug: text” adds a log line to that idea',
    // Opening an idea is what the list is for, and the activity order already puts it first.
    recents: false,
    load: async () => {
      const { ideas: files } = await port.send({ type: 'LIST_IDEAS' });
      ideas = listedIdeas(files);
      return ideas.map(ideaItem);
    },
    search: (query) => ideaItems(port, ideas, query, now),
  };
};
