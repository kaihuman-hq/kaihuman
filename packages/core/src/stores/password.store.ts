import { signal } from '@preact/signals';
import { Logger } from '../logger.js';
import { getCoreStorage } from '../storage/adapter.js';
import { githubProfileStore } from './github-profile.store.js';

const logger = new Logger('PasswordStore');

const LS_KEY = 'kaihuman_saved_passwords';
// The key before the October 2026 rename; its entries move to LS_KEY on load.
const OLD_LS_KEY = 'lifosy_saved_passwords';

// Static component of the obfuscation key. Combined with repo context so the same
// file path in different repos produces a different ciphertext.
const STATIC_KEY = 'lfs-pwstore-2025-k7v9x';

// Build a globally unique storage key: "owner/repo:file/path.enc"
function buildKey(path: string): string {
  const repo = githubProfileStore.currentRepo.value;
  return repo ? `${repo.full_name}:${path}` : path;
}

// Derive a pseudo-random keystream from a seed using djb2 mixing.
// Deterministic: same seed → same stream. Not cryptographically secure,
// but far better than plaintext for casual localStorage inspection.
function expandKey(seed: string, length: number): Uint8Array {
  const seedBytes = new TextEncoder().encode(seed);
  const stream = new Uint8Array(length);
  let h = 5381;
  for (let i = 0; i < length; i++) {
    h = (Math.imul(h, 33) ^ (seedBytes[i % seedBytes.length] ?? 0)) | 0;
    stream[i] = (h >>> 0) & 0xff;
  }
  return stream;
}

function obfuscate(plaintext: string, repoFullName: string): string {
  const cipherKey = `${STATIC_KEY}:${repoFullName}`;
  const data = new TextEncoder().encode(plaintext);
  const stream = expandKey(cipherKey, data.length);
  const xored = data.map((b, i) => b ^ (stream[i] ?? 0));
  return btoa(String.fromCharCode(...xored));
}

function deobfuscate(encoded: string, repoFullName: string): string {
  const cipherKey = `${STATIC_KEY}:${repoFullName}`;
  const data = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const stream = expandKey(cipherKey, data.length);
  const xored = data.map((b, i) => b ^ (stream[i] ?? 0));
  return new TextDecoder().decode(xored);
}

// In-memory state as a signal so UI components can reactively re-render if a file unlocks
export const unlockedFiles = signal<Record<string, boolean>>({});

const store = {
  // Decrypted passwords for the current session (never persisted)
  inMemoryPasswords: {} as Record<string, string>,

  // Raw obfuscated blobs loaded from localStorage (decrypted lazily via getPassword)
  _encryptedStored: {} as Record<string, string>,

  loadFromStorage() {
    try {
      const old = getCoreStorage().getItem(OLD_LS_KEY);
      if (old !== null) {
        if (getCoreStorage().getItem(LS_KEY) === null) getCoreStorage().setItem(LS_KEY, old);
        getCoreStorage().removeItem(OLD_LS_KEY);
      }
      const raw = getCoreStorage().getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this._encryptedStored = { ...parsed };
        }
      }
    } catch (e) {
      logger.warn('Failed to load saved passwords from local storage:', e);
    }
  },

  getPassword(path: string): string | undefined {
    const key = buildKey(path);

    // Fast path: already in memory
    if (this.inMemoryPasswords[key] !== undefined) {
      return this.inMemoryPasswords[key];
    }

    // Lazy-decrypt from stored obfuscated blob using current repo context
    const blob = this._encryptedStored[key];
    if (blob) {
      const repo = githubProfileStore.currentRepo.value;
      if (repo) {
        try {
          const decrypted = deobfuscate(blob, repo.full_name);
          if (decrypted) {
            this.inMemoryPasswords[key] = decrypted;
            unlockedFiles.value = { ...unlockedFiles.value, [path]: true };
            return decrypted;
          }
        } catch {
          // Blob was from an old format or wrong key — ignore
        }
      }
    }

    return undefined;
  },

  setPassword(path: string, password: string, remember: boolean) {
    const key = buildKey(path);
    this.inMemoryPasswords[key] = password;
    unlockedFiles.value = { ...unlockedFiles.value, [path]: true };

    if (remember) {
      try {
        const repo = githubProfileStore.currentRepo.value;
        const blob = obfuscate(password, repo?.full_name ?? 'unknown');
        const raw = getCoreStorage().getItem(LS_KEY);
        const stored = raw ? JSON.parse(raw) : {};
        stored[key] = blob;
        getCoreStorage().setItem(LS_KEY, JSON.stringify(stored));
        this._encryptedStored[key] = blob;
      } catch (e) {
        logger.warn('Failed to remember password:', e);
      }
    }
  },

  clearPassword(path: string) {
    const key = buildKey(path);
    delete this.inMemoryPasswords[key];
    delete this._encryptedStored[key];

    const newUnlocked = { ...unlockedFiles.value };
    delete newUnlocked[path];
    unlockedFiles.value = newUnlocked;

    try {
      const raw = getCoreStorage().getItem(LS_KEY);
      const stored = raw ? JSON.parse(raw) : {};
      if (stored[key]) {
        delete stored[key];
        getCoreStorage().setItem(LS_KEY, JSON.stringify(stored));
      }
    } catch {
      // ignore
    }
  },
};

// Initialize from storage on module load
store.loadFromStorage();

export const passwordStore = store;
