import { type GithubRepo, githubFileStore, githubProfileStore } from '@kaihuman/core';
import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { type LoadedFiles, loadRepoFiles } from '../repo-files';
import { BUSINESS_PROFILE_PATH, backlinkTreeItems, businessTreeItems } from './load';

export type BusinessState =
  | { status: 'no-repo' }
  | { status: 'loading' }
  | { status: 'disabled'; repo: GithubRepo }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      repo: GithubRepo;
      data: BusinessRepo;
      contents: Record<string, string>;
      /** Files that could not be fetched. Validation problems are in `data.findings`. */
      loadErrors: string[];
    };

const keyOf = (items: readonly { path: string; sha: string }[]) =>
  items.map((item) => `${item.path}@${item.sha}`).join('|');

/**
 * Loads the tree when it is empty (direct navigation) or still belongs to another repo.
 * `loadTree` itself clears the old repo's tree before fetching.
 */
const useTreeLoaded = (repoName: string | undefined) => {
  useEffect(() => {
    if (!repoName) return;
    if (
      githubFileStore.tree.peek().length === 0 ||
      githubFileStore.loadedRepo.peek() !== repoName
    ) {
      githubFileStore.loadTree();
    }
  }, [repoName]);
};

interface Loaded extends LoadedFiles {
  repo: string;
  key: string;
  data: BusinessRepo;
}

export function useBusinessRepo(): BusinessState {
  const repo = githubProfileStore.currentRepo.value;
  const tree = githubFileStore.tree.value;
  // After a repo switch the store still holds the old repo's tree until loadTree clears it.
  const treeIsCurrent = githubFileStore.loadedRepo.value === repo?.full_name;
  const treeLoading = !treeIsCurrent || (tree.length === 0 && githubFileStore.isLoading.value);
  const treeError = treeIsCurrent && tree.length === 0 ? githubFileStore.error.value : null;

  const enabled = treeIsCurrent && tree.some((item) => item.path === BUSINESS_PROFILE_PATH);
  const items = useMemo(
    () => (treeIsCurrent ? businessTreeItems(tree) : []),
    [tree, treeIsCurrent],
  );
  const itemsKey = keyOf(items);
  const wanted = `${repo?.full_name}|${itemsKey}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useTreeLoaded(repo?.full_name);

  useEffect(() => {
    if (!repo || !enabled) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    const treePaths = tree.filter((item) => item.type === 'blob').map((item) => item.path);
    loadRepoFiles(repo.full_name, items).then((result) => {
      if (cancelled) return;
      const data = loadBusinessRepo(new Map(Object.entries(result.contents)), treePaths);
      setLoaded({ ...result, repo: repo.full_name, key: wanted, data });
    });
    return () => {
      cancelled = true;
    };
  }, [repo?.full_name, itemsKey, enabled]);

  if (!repo) return { status: 'no-repo' };
  if (treeError) return { status: 'error', message: treeError };
  if (treeLoading) return { status: 'loading' };
  if (!enabled) return { status: 'disabled', repo };
  // Same repo, new shas: keep showing the previous data while the reload runs.
  if (!loaded || loaded.repo !== repo.full_name) return { status: 'loading' };
  return {
    status: 'ready',
    repo,
    data: loaded.data,
    contents: loaded.contents,
    loadErrors: loaded.errors,
  };
}

/** Wiki and idea Markdown for the client page's backlinks; fetched only once `enabled`. */
export function useBacklinkContents(enabled: boolean): Record<string, string> {
  const repo = githubProfileStore.currentRepo.value;
  const tree = githubFileStore.tree.value;
  const treeIsCurrent = githubFileStore.loadedRepo.value === repo?.full_name;
  const items = useMemo(
    () => (treeIsCurrent ? backlinkTreeItems(tree) : []),
    [tree, treeIsCurrent],
  );
  const itemsKey = keyOf(items);
  const [loaded, setLoaded] = useState<{ repo: string; contents: Record<string, string> } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled || !repo || items.length === 0) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    loadRepoFiles(repo.full_name, items).then((result) => {
      if (!cancelled) setLoaded({ repo: repo.full_name, contents: result.contents });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, repo?.full_name, itemsKey]);

  return loaded && loaded.repo === repo?.full_name ? loaded.contents : NONE;
}

const NONE: Record<string, string> = {};
