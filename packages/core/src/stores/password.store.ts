import { signal } from '@preact/signals';

const LS_KEY = 'lifosy_saved_passwords';

interface PasswordStore {
  // Key is the file absolute path, value is the decrypted password
  inMemoryPasswords: Record<string, string>;
  
  loadFromStorage(): void;
  saveToStorage(): void;
  
  getPassword(path: string): string | undefined;
  setPassword(path: string, password: string, remember: boolean): void;
  clearPassword(path: string): void;
}

// In-memory state as a signal so UI components can reactively re-render if a file unlocks
export const unlockedFiles = signal<Record<string, boolean>>({});

const store: PasswordStore = {
  inMemoryPasswords: {},

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object') {
          // Merge stored passwords into current memory
          this.inMemoryPasswords = { ...this.inMemoryPasswords, ...parsed };
          
          // Pre-populate unlock status for UI reactivity
          const unlocks: Record<string, boolean> = {};
          for (const k of Object.keys(parsed)) {
             unlocks[k] = true;
          }
          unlockedFiles.value = { ...unlockedFiles.value, ...unlocks };
        }
      }
    } catch (e) {
      console.warn('Failed to load saved passwords from local storage:', e);
    }
  },

  saveToStorage() {
    try {
      // Find which passwords the user wants remembered (or we just dump current state?)
      // We only store passwords they specifically opted in for. 
      // But for simplicity, we can just save everything that was explicitly marked "remember".
      // To manage this, we keep a separate record of "rememberable" passwords, or pull them here.
      
      const stored = localStorage.getItem(LS_KEY) ? JSON.parse(localStorage.getItem(LS_KEY)!) : {};
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
    } catch (e) {
      console.warn('Failed to save passwords to local storage:', e);
    }
  },

  getPassword(path: string) {
    return this.inMemoryPasswords[path];
  },

  setPassword(path: string, password: string, remember: boolean) {
    this.inMemoryPasswords[path] = password;
    unlockedFiles.value = { ...unlockedFiles.value, [path]: true };
    
    if (remember) {
      try {
        const stored = localStorage.getItem(LS_KEY) ? JSON.parse(localStorage.getItem(LS_KEY)!) : {};
        stored[path] = password;
        localStorage.setItem(LS_KEY, JSON.stringify(stored));
      } catch (e) {
         console.warn('Failed to remember password:', e);
      }
    }
  },

  clearPassword(path: string) {
    delete this.inMemoryPasswords[path];
    
    const newUnlocked = { ...unlockedFiles.value };
    delete newUnlocked[path];
    unlockedFiles.value = newUnlocked;
    
    try {
        const stored = localStorage.getItem(LS_KEY) ? JSON.parse(localStorage.getItem(LS_KEY)!) : {};
        if (stored[path]) {
            delete stored[path];
            localStorage.setItem(LS_KEY, JSON.stringify(stored));
        }
    } catch (e) {
         // ignore
    }
  }
};

// Initialize from storage on module load
if (typeof localStorage !== 'undefined') {
  store.loadFromStorage();
}

export const passwordStore = store;
