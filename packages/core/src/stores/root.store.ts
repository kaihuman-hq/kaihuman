import type { Signal } from '@preact/signals';
import type { Config } from '../models/types.js';
import type { AuthStore } from './auth.store.js';
import type { GithubFileStore } from './github-file.store.js';
import type { GithubProfileStore } from './github-profile.store.js';

export interface RootStore {
  auth: AuthStore;
  config: Signal<Config>;
  githubProfile: GithubProfileStore;
  githubFile: GithubFileStore;
}
