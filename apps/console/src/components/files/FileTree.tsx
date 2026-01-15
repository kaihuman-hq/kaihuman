import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { useSignalEffect } from '@preact/signals';
import { FileTree as UIFileTree } from '@lifosy/ui';

export const FileTree = () => {
  const tree = githubFileStore.tree.value;
  const isLoading = githubFileStore.isLoading.value;
  const error = githubFileStore.error.value;
  const activeFile = githubFileStore.activeFile.value;

  useSignalEffect(() => {
    // Load tree if repo is selected but tree is empty
    if (
      githubProfileStore.currentRepo.value &&
      tree.length === 0 &&
      !isLoading &&
      !error
    ) {
      githubFileStore.loadTree();
    }
  });

  return (
    <UIFileTree
      items={tree}
      activePath={activeFile}
      isLoading={isLoading}
      error={error}
      onSelect={(item) => {
        githubFileStore.openFile(item.path);
        window.location.hash = '/editor';
      }}
      onRetry={() => githubFileStore.loadTree()}
    />
  );
};
