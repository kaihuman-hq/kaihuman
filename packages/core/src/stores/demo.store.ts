import { buildDemoSeed } from '../demo/seed.js';
import { demoMode } from '../demo-mode.js';
import { Logger } from '../logger.js';
import { inMemoryGithubService } from '../services/github.service.memory.js';
import { authStore } from './auth.store.js';
import { githubFileStore } from './github-file.store.js';
import { githubProfileStore } from './github-profile.store.js';
import { layoutStore } from './layout.store.js';

const logger = new Logger('DemoStore');

/** Whether the app is currently running in demo mode. */
export const isDemoMode = demoMode;

/**
 * Enter demo mode: seed an in-memory filesystem, repo and user, and flip the
 * global `demoMode` flag so persistence is routed to memory. Routing to the
 * dashboard is left to the caller (keeps this module free of router deps).
 */
export function enterDemoMode(): void {
  const seed = buildDemoSeed();
  inMemoryGithubService.load(seed.files, seed.repos);

  // Flip the flag BEFORE seeding auth/profile so the persistence guards in the
  // stores skip writing the fake credentials to localStorage / IndexedDB.
  demoMode.value = true;

  authStore.enterDemo(seed.user);
  githubProfileStore.repos.value = seed.repos;
  const repo = seed.repos[0];
  if (repo) githubProfileStore.selectRepo(repo);

  logger.info('Entered demo mode.');
}

/** Exit demo mode and clear the in-memory session. The data is gone either way
 * on refresh; this allows leaving without one. */
export function exitDemoMode(): void {
  demoMode.value = false;
  inMemoryGithubService.reset();
  authStore.exitDemo();
  githubProfileStore.clear();
  githubFileStore.tree.value = [];
  githubFileStore.openFiles.value = {};
  githubFileStore.activeFile.value = null;
  githubFileStore.loadedRepo.value = null;
  layoutStore.remoteConfig.value = null;
  layoutStore.activeDashboardId.value = null;
  logger.info('Exited demo mode.');
}
