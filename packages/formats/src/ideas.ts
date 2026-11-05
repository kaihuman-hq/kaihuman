/**
 * Ideas: one markdown file per product or feature idea in `.kh/ideas/<slug>.md` (doc/ideas.md).
 * The slug is the id people and agents refer to, so it never changes; the title can.
 *
 * Each part of the file has one write rule, which is what keeps agents from adding noise:
 * the summary is rewritten, the log only grows (newest first), challenges are checked off but
 * never removed, and the braindump only grows at its end.
 *
 * Every edit here works on the text and leaves the parts it does not own as they were, so a
 * person's formatting survives an agent's edit. The CLI mirrors this in `apps/cli/src/ideas.rs`;
 * both test suites read `fixtures/ideas/`.
 */

import { localDate } from './dates.js';

export const IDEAS_FOLDER = '.kh/ideas';

export const IDEA_STATUSES = [
  'seed',
  'exploring',
  'committed',
  'shipped',
  'parked',
  'dropped',
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Statuses an idea can still move on from; the overviews collapse the others. */
export const OPEN_IDEA_STATUSES: readonly IdeaStatus[] = ['seed', 'exploring', 'committed'];

export const isIdeaStatus = (value: string): value is IdeaStatus =>
  (IDEA_STATUSES as readonly string[]).includes(value);

/** Lowercase kebab-case, 2–40 characters: safe in a path and easy to say. */
export type IdeaSlug = string & { readonly __brand: 'IdeaSlug' };

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const IDEA_PATH = /^\.kh\/ideas\/([a-z0-9][a-z0-9-]{1,39})\.md$/;
const SLUG_LENGTH = 40;

export const asIdeaSlug = (value: string): IdeaSlug | null =>
  SLUG.test(value) ? (value as IdeaSlug) : null;

export const ideaPath = (slug: IdeaSlug) => `${IDEAS_FOLDER}/${slug}.md`;

/** The slug an idea's file names, or `null` for any other path — subfolders included. */
export const ideaSlugOf = (path: string): IdeaSlug | null =>
  (IDEA_PATH.exec(path)?.[1] as IdeaSlug | undefined) ?? null;

/**
 * The shared slug rule for ideas, clients and projects: words joined by `-`, cut at a word end so
 * it stays readable. Shorter than 2 characters means the text has no usable slug; callers decide
 * what to do then.
 */
export const slugifyWords = (text: string): string => {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SLUG_LENGTH) break;
    slug = next;
  }
  if (!slug) slug = (words[0] ?? '').slice(0, SLUG_LENGTH);
  return slug;
};

/** A slug from a title; a title without letters or digits becomes `idea`. */
export const slugifyIdeaTitle = (title: string): IdeaSlug => {
  const slug = slugifyWords(title);
  return (slug.length >= 2 ? slug : 'idea') as IdeaSlug;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-10-13 09:12`: local time to the minute, as log entries show it. */
export const ideaLogTime = (date: Date) =>
  `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** `2026-10-13T09:12+02:00`: local time with its offset, for `created` and `updated`. */
export const ideaTimestamp = (date: Date) => {
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** Who wrote a log entry: `human`, or an agent's short name such as `claude` or `claude.ai`. */
const AUTHOR = /^[a-z0-9][a-z0-9.-]{0,30}$/;
const TAG = /^[\p{L}\p{N}][\p{L}\p{N}_./-]{0,49}$/u;

export interface IdeaLogEntry {
  /** `YYYY-MM-DD HH:MM`, local time. */
  at: string;
  author: string;
  text: string;
}

export interface IdeaChallenge {
  done: boolean;
  text: string;
}

export interface Idea {
  title: string;
  status: IdeaStatus;
  product?: string;
  tags: string[];
  links: string[];
  created?: string;
  updated?: string;
  summary: string;
  /** Newest first, as in the file. */
  log: IdeaLogEntry[];
  challenges: IdeaChallenge[];
  braindump: string;
}

// --- frontmatter ----------------------------------------------------------------------------

interface Split {
  front: string[];
  body: string[];
}

const split = (text: string): Split => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (end > 0) return { front: lines.slice(1, end), body: lines.slice(end + 1) };
  }
  return { front: [], body: lines };
};

const join = ({ front, body }: Split) =>
  `${['---', ...front, '---', ...body].join('\n').replace(/\n*$/, '')}\n`;

const fieldIndex = (front: string[], key: string) =>
  front.findIndex((line) => line.startsWith(`${key}:`));

const fieldValue = (front: string[], key: string) => {
  const index = fieldIndex(front, key);
  return index < 0 ? undefined : (front[index] ?? '').slice(key.length + 1).trim();
};

const setField = (front: string[], key: string, value: string) => {
  const index = fieldIndex(front, key);
  const line = `${key}: ${value}`;
  if (index < 0) return [...front, line];
  return front.map((existing, i) => (i === index ? line : existing));
};

const unquote = (value: string) => {
  if (value.startsWith('"')) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value.slice(1, value.endsWith('"') ? -1 : undefined);
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
};

/** `[a, b]` on one line, or a block of `  - a` lines under an empty `key:`. */
const listField = (front: string[], key: string): string[] => {
  const index = fieldIndex(front, key);
  if (index < 0) return [];
  const inline = (front[index] ?? '').slice(key.length + 1).trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  const items: string[] = [];
  for (const line of front.slice(index + 1)) {
    const match = /^\s+-\s+(.+)$/.exec(line);
    if (!match?.[1]) break;
    items.push(unquote(match[1].trim()));
  }
  return items;
};

// --- sections -------------------------------------------------------------------------------

const SECTION = /^##\s+(.+?)\s*#*\s*$/;
const isHeading = (line: string) => /^#{1,2}\s/.test(line);

interface Range {
  /** Index of the `## Name` line. */
  start: number;
  /** Index after the section's last line. */
  end: number;
}

const findSection = (body: string[], name: string): Range | null => {
  const wanted = name.toLowerCase();
  const start = body.findIndex((line) => SECTION.exec(line)?.[1]?.toLowerCase() === wanted);
  if (start < 0) return null;
  let end = start + 1;
  while (end < body.length && !isHeading(body[end] ?? '')) end++;
  return { start, end };
};

const trimBlank = (lines: string[]) => {
  let from = 0;
  let to = lines.length;
  while (from < to && !lines[from]?.trim()) from++;
  while (to > from && !lines[to - 1]?.trim()) to--;
  return lines.slice(from, to);
};

const sectionLines = (body: string[], name: string) => {
  const range = findSection(body, name);
  return range ? trimBlank(body.slice(range.start + 1, range.end)) : [];
};

/** Index of the `# Title` line, or -1. */
const titleIndex = (body: string[]) => body.findIndex((line) => /^#\s/.test(line));

/** Where the summary ends: the first `##` heading after the title. */
const firstSection = (body: string[]) => {
  const from = titleIndex(body) + 1;
  const index = body.findIndex((line, i) => i >= from && /^##\s/.test(line));
  return index < 0 ? body.length : index;
};

type Place = 'afterSummary' | 'beforeBraindump' | 'end';

/**
 * Replaces a section's content with `edit(content)`, creating the section where `place` says if
 * it is missing. A section is always written as heading, blank line, content, blank line.
 */
const editSection = (
  body: string[],
  name: string,
  place: Place,
  edit: (content: string[]) => string[],
): string[] => {
  const range = findSection(body, name);
  const block = (content: string[]) => [`## ${name}`, '', ...trimBlank(content), ''];
  if (range) {
    const content = edit(trimBlank(body.slice(range.start + 1, range.end)));
    return [...body.slice(0, range.start), ...block(content), ...body.slice(range.end)];
  }
  let at = body.length;
  if (place === 'afterSummary') at = firstSection(body);
  if (place === 'beforeBraindump') at = findSection(body, 'Braindump')?.start ?? body.length;
  const before = body.slice(0, at);
  while (before.length && !before[before.length - 1]?.trim()) before.pop();
  const after = body.slice(at);
  return [...before, '', ...block(edit([])), ...after];
};

// --- parse ----------------------------------------------------------------------------------

const LOG_ENTRY = /^[-*]\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+[·|]\s+(.+?)\s+[·|]\s+(.+)$/;
const CHALLENGE = /^[-*]\s+\[([ xX])\]\s+(.+)$/;

/** Reads an idea leniently: a hand-edited file still parses, an unknown status reads as `seed`. */
export const parseIdea = (text: string): Idea => {
  const { front, body } = split(text);
  const titleAt = titleIndex(body);
  const status = fieldValue(front, 'status') ?? '';
  const product = unquote(fieldValue(front, 'product') ?? '');
  const created = unquote(fieldValue(front, 'created') ?? '');
  const updated = unquote(fieldValue(front, 'updated') ?? '');
  const title =
    unquote(fieldValue(front, 'title') ?? '') ||
    (titleAt >= 0 ? (body[titleAt] ?? '').replace(/^#\s+/, '').trim() : '') ||
    '(untitled)';
  const idea: Idea = {
    title,
    status: isIdeaStatus(status) ? status : 'seed',
    tags: listField(front, 'tags'),
    links: listField(front, 'links'),
    summary: trimBlank(body.slice(titleAt + 1, firstSection(body))).join('\n'),
    log: sectionLines(body, 'Log').flatMap((line) => {
      const match = LOG_ENTRY.exec(line.trim());
      return match ? [{ at: match[1] ?? '', author: match[2] ?? '', text: match[3] ?? '' }] : [];
    }),
    challenges: sectionLines(body, 'Challenges').flatMap((line) => {
      const match = CHALLENGE.exec(line.trim());
      return match ? [{ done: match[1] !== ' ', text: match[2] ?? '' }] : [];
    }),
    braindump: sectionLines(body, 'Braindump').join('\n'),
  };
  if (product) idea.product = product;
  if (created) idea.created = created;
  if (updated) idea.updated = updated;
  return idea;
};

// --- edits ----------------------------------------------------------------------------------

export interface IdeaEdit {
  now: Date;
}

export interface IdeaAuthoredEdit extends IdeaEdit {
  /** `human`, or the agent's short name. */
  author: string;
}

/** One line: newlines and runs of spaces collapse, so an entry can never break the list. */
const oneLine = (text: string, what: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) throw new Error(`The ${what} is empty.`);
  return line;
};

/**
 * Braindump lines as stored: a line starting with `#` or `##` would end the section (or read as
 * the title), so it becomes a `###` heading. Deeper headings and all other text stay as typed.
 */
const braindumpLines = (text: string) =>
  trimBlank(text.replace(/\r\n/g, '\n').split('\n')).map((line) =>
    /^#{1,2}\s/.test(line) ? line.replace(/^#{1,2}/, '###') : line,
  );

const checkAuthor = (author: string) => {
  if (!AUTHOR.test(author)) {
    throw new Error(
      `"${author}" is not an author name: use lowercase letters, digits, "." or "-", such as claude.`,
    );
  }
  return author;
};

const touch = (doc: Split, now: Date): Split => ({
  ...doc,
  front: setField(doc.front, 'updated', ideaTimestamp(now)),
});

const logLine = (message: string, { author, now }: IdeaAuthoredEdit) =>
  `- ${ideaLogTime(now)} · ${checkAuthor(author)} · ${oneLine(message, 'log entry')}`;

const withLog = (body: string[], line: string) =>
  editSection(body, 'Log', 'afterSummary', (content) => [line, ...content]);

/** Adds a log entry at the top of `## Log`. */
export const logIdea = (text: string, message: string, edit: IdeaAuthoredEdit) => {
  const doc = touch(split(text), edit.now);
  return join({ ...doc, body: withLog(doc.body, logLine(message, edit)) });
};

/** Adds an open challenge at the end of `## Challenges`. */
export const addIdeaChallenge = (text: string, challenge: string, { now }: IdeaEdit) => {
  const line = `- [ ] ${oneLine(challenge, 'challenge')}`;
  const doc = touch(split(text), now);
  return join({
    ...doc,
    body: editSection(doc.body, 'Challenges', 'beforeBraindump', (content) => [...content, line]),
  });
};

/** Appends text at the end of `## Braindump`, under what is already there. */
export const appendIdeaBraindump = (text: string, addition: string, { now }: IdeaEdit) => {
  const lines = braindumpLines(addition);
  if (!lines.length) throw new Error('The braindump text is empty.');
  const doc = touch(split(text), now);
  return join({
    ...doc,
    body: editSection(doc.body, 'Braindump', 'end', (content) =>
      content.length ? [...content, '', ...lines] : lines,
    ),
  });
};

/** Replaces the summary under the title: the one part that is rewritten instead of added to. */
export const setIdeaSummary = (text: string, summary: string, { now }: IdeaEdit) => {
  const lines = trimBlank(summary.replace(/\r\n/g, '\n').split('\n'));
  if (!lines.length) throw new Error('The summary is empty.');
  const doc = touch(split(text), now);
  const titleAt = titleIndex(doc.body);
  const end = firstSection(doc.body);
  const head = titleAt >= 0 ? doc.body.slice(0, titleAt + 1) : [];
  return join({ ...doc, body: [...head, '', ...lines, '', ...doc.body.slice(end)] });
};

/** Changes the status and logs the change, with the reason if there is one. */
export const setIdeaStatus = (
  text: string,
  status: IdeaStatus,
  edit: IdeaAuthoredEdit & { reason?: string },
) => {
  const doc = touch(split(text), edit.now);
  const from = parseIdea(text).status;
  if (from === status) throw new Error(`The idea is already ${status}.`);
  const reason = edit.reason?.trim() ? ` ${oneLine(edit.reason, 'reason')}` : '';
  return join({
    front: setField(doc.front, 'status', status),
    body: withLog(doc.body, logLine(`Status ${from} → ${status}.${reason}`, edit)),
  });
};

export interface NewIdea {
  title: string;
  /** Defaults to the slug of the title. */
  slug?: string;
  status?: IdeaStatus;
  product?: string;
  tags?: string[];
  summary?: string;
  /** The raw thought, kept as the braindump. */
  braindump?: string;
  /** What the first log entry says; defaults to `Created.` */
  note?: string;
}

/** A new idea file. The caller writes it create-only, so an existing slug is never overwritten. */
export const newIdea = (input: NewIdea, edit: IdeaAuthoredEdit) => {
  const title = oneLine(input.title, 'title');
  const slug = input.slug === undefined ? slugifyIdeaTitle(title) : asIdeaSlug(input.slug);
  if (!slug) {
    throw new Error(
      `"${input.slug}" is not a slug: use 2–40 lowercase letters, digits and "-", starting with a letter or digit.`,
    );
  }
  const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const badTag = tags.find((tag) => !TAG.test(tag));
  if (badTag) throw new Error(`"${badTag}" is not a tag: use letters, digits, "_", ".", "/", "-".`);
  const stamp = ideaTimestamp(edit.now);
  const front = [
    `title: ${JSON.stringify(title)}`,
    `status: ${input.status ?? 'seed'}`,
    ...(input.product?.trim() ? [`product: ${oneLine(input.product, 'product')}`] : []),
    ...(tags.length ? [`tags: [${tags.join(', ')}]`] : []),
    `created: ${stamp}`,
    `updated: ${stamp}`,
  ];
  const summary = trimBlank((input.summary ?? '').split('\n'));
  const braindump = braindumpLines(input.braindump ?? '');
  const body = [
    '',
    `# ${title}`,
    '',
    ...(summary.length ? [...summary, ''] : []),
    '## Log',
    '',
    logLine(input.note?.trim() ? input.note : 'Created.', edit),
    '',
    ...(braindump.length ? ['## Braindump', '', ...braindump, ''] : []),
  ];
  return { slug, path: ideaPath(slug), content: join({ front, body }) };
};

// --- activity -------------------------------------------------------------------------------

export type IdeaActivityLevel = 'hot' | 'warm' | 'cool' | 'dormant';

export interface IdeaActivity {
  /** ms since epoch of the newest log entry or `updated`, whichever is later; null if neither. */
  lastAt: number | null;
  /** Log entries in the last 30 days. */
  recent: number;
  total: number;
  /** hot: within 7 days; warm: 30; cool: 90; dormant: older or never. */
  level: IdeaActivityLevel;
}

const DAY = 86_400_000;
export const IDEA_RECENT_DAYS = 30;

/** A log entry's `at` as ms since epoch (local time), or null if it is not `YYYY-MM-DD HH:MM`. */
export const ideaLogEntryTime = (at: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(at);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0).getTime();
};

export const ideaActivity = (idea: Idea, now: Date): IdeaActivity => {
  const times = idea.log.map((entry) => ideaLogEntryTime(entry.at)).filter((t) => t !== null);
  const updated = idea.updated ? Date.parse(idea.updated) : Number.NaN;
  const candidates = Number.isNaN(updated) ? times : [...times, updated];
  const lastAt = candidates.length ? Math.max(...candidates) : null;
  const since = now.getTime() - IDEA_RECENT_DAYS * DAY;
  const age = lastAt === null ? Number.POSITIVE_INFINITY : now.getTime() - lastAt;
  const level: IdeaActivityLevel =
    age <= 7 * DAY ? 'hot' : age <= 30 * DAY ? 'warm' : age <= 90 * DAY ? 'cool' : 'dormant';
  return {
    lastAt,
    recent: times.filter((t) => t >= since).length,
    total: idea.log.length,
    level,
  };
};

// --- hand-off -------------------------------------------------------------------------------

/**
 * What a chat app that cannot write to the repo hands over: a fenced `kh-idea` block of
 * `key: value` lines, pasted into `kaihuman ideas import` or the console's quick idea box.
 */
export interface IdeaHandoff {
  /** An existing slug, or absent for a new idea. */
  slug?: string;
  title?: string;
  status?: IdeaStatus;
  product?: string;
  tags: string[];
  summary?: string;
  log?: string;
  challenges: string[];
  braindump?: string;
}

const HANDOFF_BLOCK = /```kh-idea[^\n]*\n([\s\S]*?)```/g;
const HANDOFF_KEYS = [
  'slug',
  'title',
  'status',
  'product',
  'tags',
  'summary',
  'log',
  'challenges',
  'braindump',
] as const;

const parseHandoffBody = (block: string): IdeaHandoff => {
  const handoff: IdeaHandoff = { tags: [], challenges: [] };
  let key: string | null = null;
  for (const raw of block.split('\n')) {
    const field = /^([a-z]+):\s*(.*)$/.exec(raw);
    if (field && (HANDOFF_KEYS as readonly string[]).includes(field[1] ?? '')) {
      key = field[1] ?? null;
      const value = (field[2] ?? '').trim();
      if (!value || value === '|') continue;
      if (key === 'tags') handoff.tags = listField([`tags: ${value}`], 'tags');
      else if (key === 'challenges') handoff.challenges.push(unquote(value));
      else if (key === 'status') {
        if (!isIdeaStatus(value)) throw new Error(`"${value}" is not an idea status.`);
        handoff.status = value;
      } else if (key === 'slug') {
        if (value !== 'new') handoff.slug = value;
      } else {
        handoff[key as 'title' | 'product' | 'summary' | 'log' | 'braindump'] = unquote(value);
      }
      continue;
    }
    // Continuation lines: list items, or more text for a multi-line field.
    const item = /^\s*-\s+(.+)$/.exec(raw);
    if (key === 'challenges' && item?.[1]) handoff.challenges.push(unquote(item[1].trim()));
    else if (key === 'tags' && item?.[1]) handoff.tags.push(unquote(item[1].trim()));
    else if (key === 'summary' || key === 'braindump' || key === 'log') {
      const line = raw.replace(/^ {2}/, '');
      const previous = handoff[key];
      handoff[key] = previous === undefined ? line : `${previous}\n${line}`;
    }
  }
  for (const key of ['summary', 'braindump', 'log'] as const) {
    const value = handoff[key]?.trim();
    if (value) handoff[key] = value;
    else delete handoff[key];
  }
  return handoff;
};

/** Every `kh-idea` block in a pasted text; a paste of a bare block body counts as one block. */
export const parseIdeaHandoffs = (text: string): IdeaHandoff[] => {
  const normalized = text.replace(/\r\n/g, '\n');
  const blocks = [...normalized.matchAll(HANDOFF_BLOCK)].map((match) => match[1] ?? '');
  if (!blocks.length && /^(slug|title):/m.test(normalized)) blocks.push(normalized);
  return blocks.map(parseHandoffBody);
};

/**
 * Applies a hand-off to an idea's text, or creates the idea when `existing` is null. The log
 * entry is the hand-off's own `log`, or "Imported." for a new idea with none.
 */
export const applyIdeaHandoff = (
  existing: string | null,
  handoff: IdeaHandoff,
  edit: IdeaAuthoredEdit,
) => {
  if (existing === null) {
    if (!handoff.title) throw new Error('A new idea needs a title.');
    let { content, slug, path } = newIdea(
      {
        title: handoff.title,
        ...(handoff.slug === undefined ? {} : { slug: handoff.slug }),
        ...(handoff.status === undefined ? {} : { status: handoff.status }),
        ...(handoff.product === undefined ? {} : { product: handoff.product }),
        tags: handoff.tags,
        ...(handoff.summary === undefined ? {} : { summary: handoff.summary }),
        ...(handoff.braindump === undefined ? {} : { braindump: handoff.braindump }),
        note: handoff.log ?? 'Imported.',
      },
      edit,
    );
    for (const challenge of handoff.challenges)
      content = addIdeaChallenge(content, challenge, edit);
    return { slug, path, content };
  }
  const slug = handoff.slug === undefined ? null : asIdeaSlug(handoff.slug);
  if (!slug) throw new Error('A hand-off for an existing idea needs its slug.');
  let content = existing;
  if (handoff.summary) content = setIdeaSummary(content, handoff.summary, edit);
  for (const challenge of handoff.challenges) content = addIdeaChallenge(content, challenge, edit);
  if (handoff.braindump) content = appendIdeaBraindump(content, handoff.braindump, edit);
  if (handoff.status && handoff.status !== parseIdea(content).status) {
    content = setIdeaStatus(content, handoff.status, edit);
  }
  if (handoff.log) content = logIdea(content, handoff.log, edit);
  if (content === existing) throw new Error(`The hand-off for ${slug} changes nothing.`);
  return { slug, path: ideaPath(slug), content };
};

// --- finding --------------------------------------------------------------------------------

export interface IdeaRef {
  slug: IdeaSlug;
  idea: Idea;
}

/**
 * Ideas that match a few words, best first: an exact slug wins, then the number of words found
 * in the slug, title, product and tags. Used to resolve "add this to the palette idea".
 */
export const findIdeas = (ideas: IdeaRef[], query: string): IdeaRef[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return ideas
    .map((ref) => {
      if (ref.slug === q) return { ref, score: 1000 };
      const hay = [ref.slug, ref.idea.title, ref.idea.product ?? '', ...ref.idea.tags]
        .join(' ')
        .toLowerCase();
      const score = words.filter((word) => hay.includes(word)).length;
      return { ref, score: score === words.length ? score + 10 : score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.ref.slug.localeCompare(b.ref.slug))
    .map(({ ref }) => ref);
};
