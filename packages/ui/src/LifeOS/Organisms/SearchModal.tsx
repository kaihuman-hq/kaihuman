import { githubFileStore, Logger, layoutStore } from '@lifosy/core';
import {
  Command,
  CornerDownLeft,
  File,
  GitBranch,
  LayoutGrid,
  Loader2,
  Search,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';

const logger = new Logger('SearchModal');

export type SearchResultType = 'FILE' | 'COMMAND' | 'REPO' | 'WORKSPACE';

export interface SearchResult {
  name: string;
  path: string; // Used as ID or command ID
  url?: string;
  type: SearchResultType;
  description?: string;
  onSelect?: () => void;
  repository?: {
    name: string;
    owner: { login: string };
  };
}

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: SearchResult) => void;
  currentRepository?: string; // e.g. "owner/repo"
  githubToken?: string;
  files?: string[]; // Pass file list for local check

  // Command Context
  repositories?: { id: string; name: string }[];
  workspaces?: { id: string; name: string }[];
  onSelectRepository?: (repoId: string) => void;
  onSelectWorkspace?: (wsId: string) => void;
  onNavigateToFiles?: () => void;
  onCreateNewFile?: () => void;
  onOpenShortcuts?: () => void;
  onOpenActionLog?: () => void;
}

export const SearchModal = ({
  isOpen,
  onClose,
  onSelect,
  currentRepository = 'lifosy/monorepo',
  githubToken,
  repositories = [],
  workspaces = [],
  onSelectRepository,
  onSelectWorkspace,
  onNavigateToFiles,
  onCreateNewFile,
  onOpenShortcuts,
  onOpenActionLog,
}: SearchModalProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Command Generation Logic
  const getCommands = (q: string): SearchResult[] => {
    const cmds: SearchResult[] = [];
    const lowerQ = q.toLowerCase();

    // Static Commands
    const staticCommands = [
      {
        name: 'Navigate to Files',
        path: 'cmd:files',
        type: 'COMMAND',
        onSelect: onNavigateToFiles,
      },
      { name: 'Create new File', path: 'cmd:new-file', type: 'COMMAND', onSelect: onCreateNewFile },
      { name: 'Open Shortcuts', path: 'cmd:shortcuts', type: 'COMMAND', onSelect: onOpenShortcuts },
      {
        name: 'Open Action Log',
        path: 'cmd:action-log',
        type: 'COMMAND',
        onSelect: onOpenActionLog,
      },
      { name: 'Open Wiki', path: 'cmd:wiki', type: 'COMMAND', onSelect: () => handleOpenWiki() },
      { name: 'Change Repo', path: 'cmd:repo', type: 'COMMAND', onSelect: () => {} }, // Triggered by UI flow usually? Or needs specific handler
      { name: 'Change Workspace', path: 'cmd:workspace', type: 'COMMAND', onSelect: () => {} },
    ];

    staticCommands.forEach((cmd) => {
      if (cmd.name.toLowerCase().includes(lowerQ)) {
        cmds.push(cmd as SearchResult);
      }
    });

    // Repositories (Switch to Repo ABC)
    repositories.forEach((repo) => {
      const label = `Switch to Repo ${repo.name} `;
      if (label.toLowerCase().includes(lowerQ) || repo.name.toLowerCase().includes(lowerQ)) {
        cmds.push({
          name: label,
          path: `repo:${repo.id} `,
          type: 'REPO',
          description: repo.name,
          onSelect: () => onSelectRepository?.(repo.id),
        });
      }
    });

    // Workspaces (Change Workspace / Switch to Workspace ABC)
    workspaces.forEach((ws) => {
      const label = `Switch to Workspace ${ws.name} `;
      if (label.toLowerCase().includes(lowerQ) || ws.name.toLowerCase().includes(lowerQ)) {
        cmds.push({
          name: label,
          path: `ws:${ws.id} `,
          type: 'WORKSPACE',
          description: ws.name,
          onSelect: () => onSelectWorkspace?.(ws.id),
        });
      }
    });

    return cmds;
  };

  const handleOpenWiki = () => {
    const tree = githubFileStore.tree.value;
    if (!tree) {
      alert('File tree not loaded');
      return;
    }

    // 1. Look for .wiki.md files
    const wikiFiles = tree.filter((f) => f.path.endsWith('.wiki.md'));

    if (wikiFiles.length === 0) {
      // Show notification?
      alert(
        'No wiki found. Please create a file ending with .wiki.md (e.g. docs/index.wiki.md) to start a wiki.',
      );
      return;
    }

    // 2. Determine root
    // If we have distinct wiki roots, we might need to pick one.
    // For now, let's pick the first one's parent folder as root.
    const firstWiki = wikiFiles[0];
    if (!firstWiki) return;
    const root = firstWiki.path.substring(0, firstWiki.path.lastIndexOf('/'));
    // If root is empty string, it's root defined as ""

    layoutStore.activeWikiRoot.value = root || '';
    layoutStore.view.value = 'WIKI';
  };

  // Debounced Search
  // biome-ignore lint/correctness/useExhaustiveDependencies: getCommands is inline and stable per render
  useEffect(() => {
    // Always show commands if query is empty (or maybe just top commands?)
    // Requirement says "searches for files and actions", implies user types something.
    // But showing default available commands on empty query is also good UX.

    const cmds = getCommands(query);

    if (!query) {
      setLoading(false);
      setResults(cmds.slice(0, 50));
      return;
    }

    // Set immediate results with commands while waiting for API
    setLoading(true);
    setResults(cmds);
    setSelectedIndex(0);

    const timer = setTimeout(async () => {
      try {
        // GitHub Search (Content + Filename)
        const qContent = encodeURIComponent(`${query} repo:${currentRepository} `);
        const qFile = encodeURIComponent(`filename:${query} repo:${currentRepository} `);

        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
        };

        if (githubToken) {
          headers.Authorization = `Bearer ${githubToken} `;
        }

        const [resContent, resFile] = await Promise.all([
          fetch(`https://api.github.com/search/code?q=${qContent}&per_page=10`, { headers }),
          fetch(`https://api.github.com/search/code?q=${qFile}&per_page=10`, { headers }),
        ]);

        let combinedFiles: SearchResult[] = [];

        if (resContent.ok) {
          const data = await resContent.json();
          combinedFiles = [
            ...combinedFiles,
            ...(data.items || []).map((i: any) => ({ ...i, type: 'FILE' })),
          ];
        }

        if (resFile.ok) {
          const data = await resFile.json();
          // Prepend filename matches
          combinedFiles = [
            ...(data.items || []).map((i: any) => ({ ...i, type: 'FILE' })),
            ...combinedFiles,
          ];
        }

        // Deduplicate files by path
        const seen = new Set<string>();
        const uniqueFiles = combinedFiles.filter((item) => {
          if (seen.has(item.path)) return false;
          seen.add(item.path);
          return true;
        });

        // Merge: Commands First, then Files
        setResults([...cmds, ...uniqueFiles].slice(0, 50));
        setSelectedIndex(0);
      } catch (e) {
        logger.error('Search error', e);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, currentRepository, githubToken]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item: SearchResult) => {
    if (item.type === 'FILE') {
      onSelect(item);
    } else if (item.onSelect) {
      item.onSelect();
    }
    onClose();
  };

  const getIcon = (type: SearchResultType) => {
    switch (type) {
      case 'COMMAND':
        return Command;
      case 'REPO':
        return GitBranch;
      case 'WORKSPACE':
        return LayoutGrid;
      default:
        return File;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-2xl shadow-[var(--los-accent)]/20 rounded-md overflow-hidden flex flex-col max-h-[60vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header / Input */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--los-border)] gap-3">
          <Search className="text-[var(--los-accent)] shrink-0" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-[var(--los-fg)] placeholder-[var(--los-muted)] font-mono text-sm h-full"
            placeholder={`Search files in ${currentRepository}...`}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <Loader2 className="animate-spin text-[var(--los-muted)]" size={16} />}
          <div className="hidden md:flex gap-1">
            <span className="text-[10px] text-[var(--los-muted)] border border-[var(--los-border)] px-1.5 rounded-sm">
              ESC
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-2 bg-[var(--los-bg)]">
          {results.length === 0 && !loading && (
            <div className="py-8 text-center text-[var(--los-muted)]">
              <MonoText>No results found</MonoText>
            </div>
          )}

          {results.map((item, index) => {
            const Icon = getIcon(item.type);
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: search result click handler
              // biome-ignore lint/a11y/useKeyWithClickEvents: search result click handler
              <div
                key={item.path}
                onClick={() => handleSelect(item)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer transition-colors group',
                  index === selectedIndex
                    ? 'bg-[var(--los-accent-dim)]'
                    : 'hover:bg-[var(--los-accent-dim)]',
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    'shrink-0',
                    index === selectedIndex
                      ? 'text-[var(--los-accent)]'
                      : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]',
                  )}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={cn(
                      'text-sm truncate font-mono',
                      index === selectedIndex
                        ? 'text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]',
                    )}
                  >
                    {item.name}
                  </span>
                  {item.type === 'FILE' && (
                    <span className="text-[10px] text-[var(--los-muted)] truncate opacity-60">
                      {item.path}
                    </span>
                  )}
                  {item.description && (
                    <span className="text-[10px] text-[var(--los-muted)] truncate opacity-60">
                      {item.description}
                    </span>
                  )}
                </div>
                {index === selectedIndex && (
                  <CornerDownLeft size={14} className="text-[var(--los-accent)] opacity-50" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 border-t border-[var(--los-border)] bg-[var(--los-panel)] flex justify-between items-center">
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            GitHub Search API & Commands
          </MonoText>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {results.length} results
          </MonoText>
        </div>
      </div>
    </div>
  );
};
