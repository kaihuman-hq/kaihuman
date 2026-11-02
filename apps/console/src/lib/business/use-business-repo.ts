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

/** Loads the tree when nothing has (direct navigation), as IdeasPage does. */
const useTreeLoaded = () => {
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) githubFileStore.loadTree();
  }, []);
};

export function useBusinessRepo(): BusinessState {
  const repo = githubProfileStore.currentRepo.value;
  const tree = githubFileStore.tree.value;
  const treeLoading =
    tree.length === 0 &&
    (githubFileStore.isLoading.value || githubFileStore.loadedRepo.value !== repo?.full_name);
  const treeError = tree.length === 0 ? githubFileStore.error.value : null;

  const enabled = tree.some((item) => item.path === BUSINESS_PROFILE_PATH);
  const items = useMemo(() => businessTreeItems(tree), [tree]);
  const itemsKey = keyOf(items);
  const wanted = `${repo?.full_name}|${itemsKey}`;

  const [loaded, setLoaded] = useState<(LoadedFiles & { key: string }) | null>(null);
  useTreeLoaded();

  useEffect(() => {
    if (!repo || !enabled) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    loadRepoFiles(repo.full_name, items).then((result) => {
      if (!cancelled) setLoaded({ ...result, key: wanted });
    });
    return () => {
      cancelled = true;
    };
  }, [repo?.full_name, itemsKey, enabled]);

  const current = loaded?.key === wanted ? loaded : null;
  const data = useMemo(
    () =>
      current &&
      loadBusinessRepo(
        new Map(Object.entries(current.contents)),
        tree.filter((item) => item.type === 'blob').map((item) => item.path),
      ),
    [current, tree],
  );

  if (!repo) return { status: 'no-repo' };
  if (treeError) return { status: 'error', message: treeError };
  if (treeLoading) return { status: 'loading' };
  if (!enabled) return { status: 'disabled', repo };
  if (!current || !data) return { status: 'loading' };
  return {
    status: 'ready',
    repo,
    data,
    contents: current.contents,
    loadErrors: current.errors,
  };
}

/** Wiki and idea Markdown for the client page's backlinks; fetched only once `enabled`. */
export function useBacklinkContents(enabled: boolean): Record<string, string> {
  const repo = githubProfileStore.currentRepo.value;
  const tree = githubFileStore.tree.value;
  const items = useMemo(() => backlinkTreeItems(tree), [tree]);
  const itemsKey = keyOf(items);
  const [contents, setContents] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled || !repo || items.length === 0) {
      setContents({});
      return;
    }
    let cancelled = false;
    loadRepoFiles(repo.full_name, items).then((result) => {
      if (!cancelled) setContents(result.contents);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, repo?.full_name, itemsKey]);

  return contents;
}
