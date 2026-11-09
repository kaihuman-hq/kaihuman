import { beforeEach, describe, expect, it, vi } from 'vitest';

// A Map-backed stand-in for expo-file-system's File/Directory, logging each native call.
const disk = vi.hoisted(() => ({ files: new Map<string, string>(), log: [] as string[] }));

vi.mock('expo-file-system', () => {
  const join = (parent: { uri: string } | string, name: string) =>
    `${typeof parent === 'string' ? parent : parent.uri}/${name}`;
  class Directory {
    uri: string;
    constructor(parent: { uri: string } | string, name: string) {
      this.uri = join(parent, name);
    }
    create() {}
    get exists() {
      return true;
    }
    list() {
      return [];
    }
  }
  class File {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = join(parent, name);
    }
    get exists() {
      return disk.files.has(this.uri);
    }
    textSync() {
      return disk.files.get(this.uri) ?? '';
    }
    async text() {
      return this.textSync();
    }
    writeSync(text: string) {
      disk.log.push(`write ${this.uri}`);
      disk.files.set(this.uri, text);
    }
    async write(text: string) {
      this.writeSync(text);
    }
    moveSync(to: File, options?: { overwrite?: boolean }) {
      if (to.exists && !options?.overwrite) throw new Error('exists');
      disk.log.push(`move ${this.uri} -> ${to.uri}`);
      disk.files.set(to.uri, disk.files.get(this.uri) ?? '');
      disk.files.delete(this.uri);
    }
    delete() {
      disk.files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: 'doc' } };
});

const { createExpoCacheFs } = await import('./expo-cache-fs.js');

beforeEach(() => {
  disk.files.clear();
  disk.log.length = 0;
});

describe('expo cache fs', () => {
  it('never writes the target in place: temp file first, then a rename over it', async () => {
    const fs = createExpoCacheFs();
    if (!fs) throw new Error('no fs');
    disk.files.set('doc/kh-cache/kv.json', 'old');
    fs.writeSync('kv.json', 'new');
    await fs.write('files/a.json', '{}');
    expect(disk.log).toEqual([
      'write doc/kh-cache/kv.json.tmp',
      'move doc/kh-cache/kv.json.tmp -> doc/kh-cache/kv.json',
      'write doc/kh-cache/files/a.json.tmp',
      'move doc/kh-cache/files/a.json.tmp -> doc/kh-cache/files/a.json',
    ]);
    expect(fs.readSync('kv.json')).toBe('new');
    expect(disk.files.has('doc/kh-cache/kv.json.tmp')).toBe(false);
  });
});
