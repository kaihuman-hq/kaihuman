import { docsForFile, type SearchDoc } from './documents.js';
import { prepareDocs, type SearchGroup, searchDocs } from './search.js';

export interface TreeEntry {
  path: string;
  sha: string;
  type: string;
}

export interface UpdateOptions {
  /** Longest stretch of extraction before handing the thread back. Below one 60 fps frame. */
  budgetMs?: number;
  now?: () => number;
  yieldTo?: () => Promise<void>;
}

interface Entry {
  sha: string;
  docs: SearchDoc[];
  /** Content was not cached: the file is indexed by name only, and is retried next update. */
  nameOnly: boolean;
}

/** Search documents per repo file, kept in step with the file tree by sha. */
export class SearchIndex {
  private entries = new Map<string, Entry>();
  private flat: SearchDoc[] | null = [];
  private generation = 0;
  /** Bumped on every change so a view knows to query again. */
  version = 0;

  /**
   * Brings the index up to date with `tree`, re-extracting only new or changed files. Work is sliced
   * by `budgetMs` so thousands of files never freeze the UI; a newer call supersedes this one.
   * `read` returns cached content only, null meaning name-only.
   */
  async update(
    tree: readonly TreeEntry[],
    read: (path: string) => string | null,
    {
      budgetMs = 8,
      now = () => performance.now(),
      yieldTo = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    }: UpdateOptions = {},
  ): Promise<{ changed: number }> {
    const generation = ++this.generation;
    const files = tree.filter((t) => t.type !== 'tree');
    let changed = 0;

    const present = new Set(files.map((f) => f.path));
    for (const path of [...this.entries.keys()]) {
      if (present.has(path)) continue;
      this.entries.delete(path);
      changed++;
    }
    if (changed) this.touch();

    let chunkStart = now();
    for (const { path, sha } of files) {
      const known = this.entries.get(path);
      if (known?.sha === sha && !known.nameOnly) continue;
      const content = read(path);
      // Still uncached: nothing new to learn, and no reason to report a change.
      if (known?.sha === sha && content === null) continue;
      const docs = docsForFile(path, content);
      prepareDocs(docs);
      this.entries.set(path, { sha, docs, nameOnly: content === null });
      changed++;
      this.touch();
      if (now() - chunkStart >= budgetMs) {
        await yieldTo();
        if (generation !== this.generation) return { changed };
        chunkStart = now();
      }
    }
    return { changed };
  }

  private touch() {
    this.flat = null;
    this.version++;
  }

  docs(): SearchDoc[] {
    this.flat ??= [...this.entries.values()].flatMap((e) => e.docs);
    return this.flat;
  }

  search(query: string, perKind?: number): SearchGroup[] {
    return searchDocs(this.docs(), query, perKind === undefined ? undefined : { perKind });
  }
}
