import { Directory, File, Paths } from 'expo-file-system';
import type { CacheFs } from './persistent-storage.js';

/** Device `CacheFs` under `Paths.document/kh-cache`; null when the native module is unavailable. */
export function createExpoCacheFs(): CacheFs | null {
  try {
    const root = new Directory(Paths.document, 'kh-cache');
    root.create({ intermediates: true, idempotent: true });
    const fileAt = (path: string) => new File(root, path);
    const ensureParent = (path: string) => {
      const slash = path.lastIndexOf('/');
      if (slash < 0) return;
      new Directory(root, path.slice(0, slash)).create({ intermediates: true, idempotent: true });
    };
    return {
      readSync(path) {
        const f = fileAt(path);
        return f.exists ? f.textSync() : null;
      },
      writeSync(path, text) {
        ensureParent(path);
        const f = fileAt(path);
        if (!f.exists) f.create({ intermediates: true });
        f.writeSync(text);
      },
      async read(path) {
        const f = fileAt(path);
        return f.exists ? f.text() : null;
      },
      async write(path, text) {
        ensureParent(path);
        const f = fileAt(path);
        if (!f.exists) f.create({ intermediates: true });
        await f.write(text);
      },
      async remove(path) {
        const f = fileAt(path);
        if (f.exists) f.delete();
      },
      async list(dir) {
        const d = new Directory(root, dir);
        return d.exists ? d.list().map((entry) => entry.name) : [];
      },
    };
  } catch {
    return null;
  }
}
