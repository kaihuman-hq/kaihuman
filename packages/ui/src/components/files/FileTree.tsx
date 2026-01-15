import { File, Folder } from 'lucide-preact';
import { cn } from '../../utils';

export interface FileTreeItem {
  path: string;
  type: 'blob' | 'tree' | string;
  sha?: string;
}

export interface FileTreeProps {
  items: FileTreeItem[];
  activePath?: string | null;
  onSelect?: (item: FileTreeItem) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const FileTree = ({
  items,
  activePath,
  onSelect,
  isLoading,
  error,
  onRetry,
  className
}: FileTreeProps) => {

  if (isLoading) {
    return <div class="p-4 text-xs text-nexus-muted animate-pulse">Loading files...</div>;
  }

  if (error) {
    return (
      <div class="p-4 text-xs text-red-500">
        Error: {error}
        {onRetry && (
          <button
            onClick={onRetry}
            class="block mt-2 underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div class="p-4 text-xs text-nexus-muted">
        No files found.
        {onRetry && (
          <button
            onClick={onRetry}
            class="block mt-2 underline"
          >
            Load Files
          </button>
        )}
      </div>
    );
  }

  // Sort: folders first, then alphabetical path
  const sortedItems = [...items].sort((a, b) => {
    return a.path.localeCompare(b.path);
  });

  return (
    <div class={cn("overflow-y-auto flex-1 py-2", className)}>
      {sortedItems.map((item) => {
        const depth = item.path.split('/').length - 1;
        const isFolder = item.type === 'tree'; // GitHub API type
        const isActive = activePath === item.path;

        return (
          <div
            key={item.path}
            class={cn(
              "group flex items-center gap-2 px-2 py-1 text-sm cursor-pointer select-none transition-colors truncate",
              isActive
                ? "bg-nexus-primary/20 text-nexus-primary"
                : "text-nexus-muted hover:text-nexus-text hover:bg-nexus-primary/10",
              isFolder && "font-semibold text-nexus-text/80"
            )}
            style={{ paddingLeft: `${(depth * 12) + 8}px` }}
            onClick={() => {
              if (!isFolder && onSelect) {
                onSelect(item);
              }
            }}
          >
            {isFolder ? <Folder size={14} /> : <File size={14} />}
            <span class="truncate">{item.path.split('/').pop()}</span>
          </div>
        );
      })}
    </div>
  );
};
