import {
  decrypt,
  encrypt,
  githubFileStore,
  githubProfileStore,
  passwordStore,
  type TreeItem,
} from '@kaihuman/core';
import { syncActions } from '../sync/actions.js';
import { canServeFromCache } from '../sync/revalidate.js';

/**
 * The slice of the repository file store the content screens use. Injected so controllers run
 * against an in-memory fake in tests and against `githubFileStore` on the device.
 */
export interface ContentFiles {
  tree(): TreeItem[];
  refresh(): Promise<void>;
  read(path: string): Promise<string>;
  /** Replaces the content of an existing file. */
  write(path: string, content: string): Promise<void>;
  /** Creates a file; rejects when it already exists. */
  create(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export const githubContentFiles: ContentFiles = {
  tree: () => githubFileStore.tree.value,
  async refresh() {
    const repo = githubProfileStore.currentRepo.peek()?.full_name;
    const hasTree =
      githubFileStore.loadedRepo.peek() === repo && githubFileStore.tree.peek().length > 0;
    // With a tree on screen a focus refresh is stale-gated and cheap; the first load must complete.
    await syncActions().refreshAll({ reason: hasTree ? 'focus' : 'pull' });
  },
  async read(path) {
    const open = githubFileStore.openFiles.peek()[path];
    const item = githubFileStore.tree.peek().find((t) => t.path === path);
    // The tree sha says whether the cached copy is current, so unchanged files cost no request.
    if (open && canServeFromCache(open, item, githubFileStore.dirtyFiles.peek().has(path))) {
      return open.content;
    }
    await githubFileStore.openFile(path);
    const file = githubFileStore.openFiles.peek()[path];
    if (!file) throw new Error(`Could not open ${path}`);
    return file.content;
  },
  async write(path, content) {
    githubFileStore.updateFileContent(path, content);
    // Persist the dirty copy so input survives the app being killed; the outbox pushes it later.
    await githubFileStore.flushPendingWrites();
    syncActions().notifyLocalWrite();
  },
  create: (path, content) => githubFileStore.createFile(path, content),
  remove: (path) => githubFileStore.deleteFile(path),
  rename: (from, to) => githubFileStore.renameFile(from, to),
};

/** Direct children (blob files) of a folder, `''` being the repository root. */
export const filesIn = (tree: TreeItem[], folder: string): TreeItem[] => {
  const prefix = folder ? `${folder}/` : '';
  return tree.filter(
    (item) =>
      item.type !== 'tree' &&
      item.path.startsWith(prefix) &&
      !item.path.slice(prefix.length).includes('/'),
  );
};

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const dirname = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export interface PasswordPort {
  getPassword(path: string): string | undefined;
  setPassword(path: string, password: string, remember: boolean): void;
  clearPassword(path: string): void;
}

export interface CryptoPort {
  encrypt(text: string, password: string): Promise<string>;
  decrypt(cipher: string, password: string): Promise<string>;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  encrypted: boolean;
}

export type FileKind = 'markdown' | 'text';

export type FileEditorState =
  | { status: 'closed' }
  | { status: 'locked'; path: string; error?: string }
  | {
      status: 'open';
      path: string;
      kind: FileKind;
      encrypted: boolean;
      content: string;
      dirty: boolean;
    };

export interface FileEditorDeps {
  files?: ContentFiles;
  passwords?: PasswordPort;
  crypto?: CryptoPort;
}

const isEncrypted = (path: string) => path.toLowerCase().endsWith('.enc');
/** The extension that decides how the editor treats the file, ignoring a trailing `.enc`. */
const innerName = (path: string) => (isEncrypted(path) ? path.slice(0, -4) : path);
const kindOf = (path: string): FileKind =>
  /\.(md|markdown)$/i.test(innerName(path)) ? 'markdown' : 'text';

export class FileEditorController {
  private readonly files: ContentFiles;
  private readonly passwords: PasswordPort;
  private readonly crypto: CryptoPort;
  private cwd = '';
  state: FileEditorState = { status: 'closed' };
  /** Cipher text kept while a file is locked, so unlock does not refetch. */
  private cipher = '';

  constructor({ files, passwords, crypto }: FileEditorDeps = {}) {
    this.files = files ?? githubContentFiles;
    this.passwords = passwords ?? passwordStore;
    this.crypto = crypto ?? { encrypt, decrypt };
  }

  get folder(): string {
    return this.cwd;
  }

  refresh(): Promise<void> {
    return this.files.refresh();
  }

  /** Folders first, then files, each sorted by name. */
  list(folder: string = this.cwd): DirectoryEntry[] {
    const prefix = folder ? `${folder}/` : '';
    const folders = new Set<string>();
    const entries: DirectoryEntry[] = [];
    for (const item of this.files.tree()) {
      if (!item.path.startsWith(prefix)) continue;
      const rest = item.path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash >= 0) folders.add(rest.slice(0, slash));
      else if (item.type === 'tree') folders.add(rest);
      else
        entries.push({ name: rest, path: item.path, kind: 'file', encrypted: isEncrypted(rest) });
    }
    const dirs: DirectoryEntry[] = [...folders].map((name) => ({
      name,
      path: `${prefix}${name}`,
      kind: 'folder',
      encrypted: false,
    }));
    const byName = (a: DirectoryEntry, b: DirectoryEntry) => a.name.localeCompare(b.name);
    return [...dirs.sort(byName), ...entries.sort(byName)];
  }

  enter(folder: string): void {
    this.cwd = folder.replace(/^\/+|\/+$/g, '');
  }

  up(): void {
    this.cwd = dirname(this.cwd);
  }

  /** Breadcrumb segments from the root to the current folder. */
  breadcrumbs(): { name: string; path: string }[] {
    const parts = this.cwd ? this.cwd.split('/') : [];
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  }

  async open(path: string): Promise<FileEditorState> {
    const raw = await this.files.read(path);
    if (!isEncrypted(path)) {
      this.state = {
        status: 'open',
        path,
        kind: kindOf(path),
        encrypted: false,
        content: raw,
        dirty: false,
      };
      return this.state;
    }
    this.cipher = raw;
    const saved = this.passwords.getPassword(path);
    if (saved === undefined) {
      this.state = { status: 'locked', path };
      return this.state;
    }
    return this.decryptWith(path, saved, false, true);
  }

  /** Unlocks the open `.enc` file; a wrong password leaves it locked with an error. */
  async unlock(password: string, remember = false): Promise<FileEditorState> {
    if (this.state.status !== 'locked') return this.state;
    return this.decryptWith(this.state.path, password, remember, false);
  }

  /** Forgets the password and shows the lock screen again. */
  lock(): void {
    if (this.state.status !== 'open' || !this.state.encrypted) return;
    this.passwords.clearPassword(this.state.path);
    this.cipher = '';
    this.state = { status: 'locked', path: this.state.path };
  }

  edit(content: string): void {
    if (this.state.status !== 'open') return;
    this.state = { ...this.state, content, dirty: true };
  }

  /** Saves the open file; `.enc` files are encrypted again with the unlock password. */
  async save(): Promise<void> {
    const state = this.state;
    if (state.status !== 'open' || !state.dirty) return;
    let body = state.content;
    if (state.encrypted) {
      const password = this.passwords.getPassword(state.path);
      if (password === undefined) throw new Error('The file is locked.');
      body = await this.crypto.encrypt(state.content, password);
    }
    await this.files.write(state.path, body);
    this.state = { ...state, dirty: false };
  }

  close(): void {
    this.state = { status: 'closed' };
    this.cipher = '';
  }

  /** Creates a file; a `.enc` name needs `password` and stores the content encrypted. */
  async createFile(path: string, content = '', password?: string): Promise<void> {
    if (isEncrypted(path)) {
      if (!password) throw new Error('An encrypted file needs a password.');
      await this.files.create(path, await this.crypto.encrypt(content, password));
      this.passwords.setPassword(path, password, false);
      return;
    }
    await this.files.create(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    await this.files.remove(path);
    this.passwords.clearPassword(path);
    if (this.state.status !== 'closed' && this.state.path === path) this.close();
  }

  /** Renames a file; it may not gain or lose `.enc`, which would corrupt how it is read. */
  async renameFile(from: string, to: string): Promise<void> {
    if (isEncrypted(from) !== isEncrypted(to)) {
      throw new Error('Renaming cannot add or remove the .enc extension.');
    }
    await this.files.rename(from, to);
    if (this.state.status !== 'closed' && this.state.path === from) this.close();
  }

  private async decryptWith(
    path: string,
    password: string,
    remember: boolean,
    fromSaved: boolean,
  ): Promise<FileEditorState> {
    try {
      const content = await this.crypto.decrypt(this.cipher, password);
      this.passwords.setPassword(path, password, remember);
      this.state = {
        status: 'open',
        path,
        kind: kindOf(path),
        encrypted: true,
        content,
        dirty: false,
      };
    } catch {
      if (fromSaved) this.passwords.clearPassword(path);
      this.state = { status: 'locked', path, error: 'Wrong password or corrupted file.' };
    }
    return this.state;
  }
}
