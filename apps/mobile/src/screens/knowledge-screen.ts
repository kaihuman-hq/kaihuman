import { type ContentFiles, githubContentFiles } from './file-editor-screen.js';

export const KNOWLEDGE_INBOX = '.kh/raw';
export const KNOWLEDGE_PROCESSED = `${KNOWLEDGE_INBOX}/processed`;

export interface KnowledgeItem {
  path: string;
  name: string;
  title: string;
}

export interface KnowledgeDeps {
  files?: ContentFiles;
  now?: () => Date;
}

const slugOf = (line: string) =>
  line
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
    .replace(/-+$/, '') || 'note';

/**
 * A raw note in the same shape `kaihuman capture` and the console write, so `/kb-ingest` picks
 * it up. Mirrors `knowledgeNote` in `@kaihuman/palette`, which the mobile app does not depend on.
 */
export const rawNote = (text: string, now: Date): { path: string; content: string } => {
  const body = text.trim();
  if (!body) throw new Error('Nothing to capture');
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  const title = firstLine.slice(0, 80).replace(/"/g, '\\"');
  const date = now.toISOString().slice(0, 10);
  return {
    path: `${KNOWLEDGE_INBOX}/${now.getTime()}-${slugOf(firstLine)}.md`,
    content: `---\ntitle: "${title}"\nurl: ''\ndate: ${date}\nprocessed: false\ntags: [general]\n---\n\n${body}\n`,
  };
};

export class KnowledgeScreenController {
  private readonly files: ContentFiles;
  private readonly now: () => Date;
  private titles = new Map<string, string>();

  constructor({ files, now }: KnowledgeDeps = {}) {
    this.files = files ?? githubContentFiles;
    this.now = now ?? (() => new Date());
  }

  /** Reads the title of each note so lists can show it. */
  async load(): Promise<void> {
    await this.files.refresh();
    const paths = [...this.paths(KNOWLEDGE_INBOX), ...this.paths(KNOWLEDGE_PROCESSED)];
    const next = new Map<string, string>();
    await Promise.all(
      paths.map(async (path) => {
        try {
          next.set(path, titleOf(await this.files.read(path), path));
        } catch {
          next.set(path, path.slice(path.lastIndexOf('/') + 1));
        }
      }),
    );
    this.titles = next;
  }

  /** Notes waiting for `/kb-ingest`, newest first (names start with the capture time). */
  inbox(): KnowledgeItem[] {
    return this.items(KNOWLEDGE_INBOX);
  }

  processed(): KnowledgeItem[] {
    return this.items(KNOWLEDGE_PROCESSED);
  }

  /** Adds a note to the inbox and returns its path. */
  async addNote(text: string): Promise<string> {
    const { path, content } = rawNote(text, this.now());
    await this.files.create(path, content);
    this.titles.set(path, titleOf(content, path));
    return path;
  }

  /** Files a note as processed by moving it under `processed/`, as `/kb-ingest` would. */
  async archive(path: string): Promise<void> {
    const to = `${KNOWLEDGE_PROCESSED}/${path.slice(path.lastIndexOf('/') + 1)}`;
    await this.files.rename(path, to);
    const title = this.titles.get(path);
    this.titles.delete(path);
    if (title !== undefined) this.titles.set(to, title);
  }

  /** Deletes a note for good. */
  async remove(path: string): Promise<void> {
    await this.files.remove(path);
    this.titles.delete(path);
  }

  private paths(folder: string): string[] {
    const prefix = `${folder}/`;
    return this.files
      .tree()
      .filter(
        (i) =>
          i.type !== 'tree' &&
          i.path.startsWith(prefix) &&
          i.path.endsWith('.md') &&
          !i.path.slice(prefix.length).includes('/'),
      )
      .map((i) => i.path);
  }

  private items(folder: string): KnowledgeItem[] {
    return this.paths(folder)
      .map((path) => {
        const name = path.slice(path.lastIndexOf('/') + 1);
        return { path, name, title: this.titles.get(path) ?? name };
      })
      .sort((a, b) => captured(b.name) - captured(a.name) || b.name.localeCompare(a.name));
  }
}

/** The capture time a note's filename starts with, 0 when it has none. */
const captured = (name: string) => Number(/^(\d+)-/.exec(name)?.[1] ?? 0);

const titleOf = (content: string, path: string): string => {
  const match = /^---\r?\n[\s\S]*?^title:\s*(.*)$/m.exec(content);
  const raw = match?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2');
  return raw || path.slice(path.lastIndexOf('/') + 1);
};
