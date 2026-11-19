import { BRAINDUMP_FOLDER, braindumpIdOf, braindumpTitle } from '@kaihuman/formats';
import { type ContentFiles, githubContentFiles } from './file-editor-screen.js';

export interface BraindumpItem {
  path: string;
  /** Creation time in ms, from the file name. */
  createdAt: number;
  title: string;
}

/** Lists `.kh/braindumps/` (written by the desktop braindump window and the mobile ＋ menu). */
export class BraindumpsScreenController {
  private readonly files: ContentFiles;
  private loaded: BraindumpItem[] = [];

  constructor({ files }: { files?: ContentFiles } = {}) {
    this.files = files ?? githubContentFiles;
  }

  async load(): Promise<void> {
    await this.files.refresh();
    const found = this.files
      .tree()
      .filter((t) => t.type === 'blob' && t.path.startsWith(`${BRAINDUMP_FOLDER}/`))
      .flatMap((t) => {
        const id = braindumpIdOf(t.path);
        return id ? [{ path: t.path, createdAt: Number(id) }] : [];
      });
    this.loaded = await Promise.all(
      found.map(async ({ path, createdAt }) => {
        try {
          return { path, createdAt, title: braindumpTitle(await this.files.read(path)) };
        } catch {
          return { path, createdAt, title: path.slice(path.lastIndexOf('/') + 1) };
        }
      }),
    );
  }

  /** Newest first. */
  items(): BraindumpItem[] {
    return [...this.loaded].sort((a, b) => b.createdAt - a.createdAt);
  }
}
