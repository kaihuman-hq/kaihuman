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
    // Write a sibling temp file, then rename it over the target: a crash mid-write leaves the
    // old file whole instead of a truncated one (expo's own write truncates in place).
    const tempFor = (path: string) => fileAt(`${path}.tmp`);
    const commit = (path: string) => tempFor(path).moveSync(fileAt(path), { overwrite: true });
    return {
      readSync(path) {
        const f = fileAt(path);
        return f.exists ? f.textSync() : null;
      },
      writeSync(path, text) {
        ensureParent(path);
        tempFor(path).writeSync(text);
        commit(path);
      },
      async read(path) {
        const f = fileAt(path);
        return f.exists ? f.text() : null;
      },
      async write(path, text) {
        ensureParent(path);
        await tempFor(path).write(text);
        commit(path);
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
