/**
 * A cached open copy can answer a read without the network when the tree says the file has not
 * moved on (same blob sha), when local edits make the copy authoritative, or when the tree has
 * no usable entry to compare with. An empty tree sha marks an item whose sha is not yet known.
 */
export function canServeFromCache(
  open: { sha: string } | undefined,
  treeItem: { sha: string } | undefined,
  dirty: boolean,
): boolean {
  return (
    open !== undefined &&
    (dirty || treeItem === undefined || treeItem.sha === '' || treeItem.sha === open.sha)
  );
}

/** The first run for a repo (or one that has no tree yet) must list the tree; later runs only sync. */
export function shouldFullLoad(
  loadedRepo: string | null | undefined,
  currentRepo: string | null | undefined,
  treeLength: number,
): boolean {
  return !currentRepo || loadedRepo !== currentRepo || treeLength === 0;
}
