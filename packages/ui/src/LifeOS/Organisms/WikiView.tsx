import { githubFileStore, Logger, layoutStore, type TreeItem } from '@lifosy/core';
import { Check, ChevronDown, ChevronRight, Copy, Edit3, FileText, Menu } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { cn } from '../../utils';
import 'highlight.js/styles/github-dark.css'; // Or any other style

const _logger = new Logger('WikiView');

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

interface WikiViewProps {
  rootPath?: string; // optional — defaults to '' (whole repo)
  onEdit?: (path: string) => void; // caller handles navigation
}

export const WikiView = ({ rootPath = '', onEdit }: WikiViewProps) => {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Use store directly
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;

  // -- Derived State: Wiki Tree --
  // Filter tree to only show items under rootPath and valid extensions
  const wikiTree = useMemo(() => {
    if (!tree) return [];
    return tree.filter((item) => {
      if (rootPath && !item.path.startsWith(rootPath)) return false;
      if (item.type === 'tree') return true;
      if (!rootPath) return true; // all-files mode: show everything
      return item.path.endsWith('.md');
    });
  }, [tree, rootPath]);

  // Set initial active file if none
  useEffect(() => {
    if (!activeFile && wikiTree.length > 0) {
      const candidates = rootPath
        ? [`${rootPath}/index.wiki.md`, `${rootPath}/index.md`, `${rootPath}/README.md`]
        : ['index.wiki.md', 'index.md', 'README.md'];
      const index = wikiTree.find((i) => candidates.includes(i.path));
      if (index) {
        setActiveFile(index.path);
      } else {
        const firstMd = wikiTree.find((i) => i.type !== 'tree' && i.path.endsWith('.md'));
        if (firstMd) setActiveFile(firstMd.path);
      }
    }
  }, [wikiTree, activeFile, rootPath]);

  // Load active file content
  useEffect(() => {
    if (activeFile) {
      githubFileStore.openFile(activeFile);
    }
  }, [activeFile]);

  const rawContent = activeFile ? openFiles[activeFile]?.content : '';
  const content = rawContent ? stripFrontmatter(rawContent) : '';

  const handleEdit = () => {
    if (!activeFile) return;
    if (onEdit) {
      onEdit(activeFile);
    } else {
      layoutStore.navigate(activeFile);
      layoutStore.view.value = 'DASHBOARD';
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d1117] text-[#c9d1d9]">
      {/* Sidebar */}
      <div
        className={cn(
          'flex-shrink-0 bg-[#010409] border-r border-[#30363d] transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden',
        )}
      >
        <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
          <span className="font-bold text-sm truncate">Wiki</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <WikiSidebar
            items={wikiTree}
            rootPath={rootPath}
            activeFile={activeFile}
            onSelect={setActiveFile}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header/Toolbar */}
        <div className="h-12 border-b border-[#30363d] flex items-center px-4 gap-4 bg-[#0d1117]">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-[#21262d] rounded text-[#8b949e]"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 font-mono text-sm text-[#8b949e]">
            {activeFile || 'Select a file...'}
          </div>
          {activeFile && (
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-2 px-3 py-1 bg-[#238636] text-white text-xs font-bold rounded hover:bg-[#2ea043] transition-colors"
            >
              <Edit3 size={14} />
              Edit
            </button>
          )}
        </div>

        {/* Markdown Content */}
        <div className="flex-1 overflow-y-auto p-8 lg:px-16 xl:px-32">
          <div className="prose prose-invert max-w-4xl mx-auto pb-20">
            {activeFile && content && activeFile.endsWith('.md') ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: (({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <CodeBlock
                        language={match[1]}
                        value={String(children).replace(/\n$/, '')}
                        {...props}
                      />
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }) as any,
                }}
              >
                {content}
              </ReactMarkdown>
            ) : activeFile && !activeFile.endsWith('.md') ? (
              <div className="text-center text-[#8b949e] mt-20 space-y-4">
                <p>No preview for this file type.</p>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex items-center gap-2 px-3 py-1 bg-[#238636] text-white text-xs font-bold rounded hover:bg-[#2ea043] transition-colors mx-auto"
                >
                  <Edit3 size={14} />
                  Open in editor
                </button>
              </div>
            ) : (
              <div className="text-center text-[#8b949e] mt-20">
                {activeFile ? 'Loading content...' : 'Select a page from the sidebar'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// -- Sidebar Component --
const WikiSidebar = ({ items, rootPath, activeFile, onSelect }: any) => {
  // Build tree structure from flat list
  const treeStructure = useMemo(() => {
    const root: any = { children: {} };

    items.forEach((item: TreeItem) => {
      // Relative path
      const rel = item.path.substring(rootPath.length).replace(/^\//, '');
      if (!rel) return;

      const parts = rel.split('/');
      let current = root;

      parts.forEach((part: string, idx: number) => {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: idx === parts.length - 1 ? item.path : null, // Only leaf has path matching item
            type: idx === parts.length - 1 ? item.type : 'tree',
            children: {},
          };
        }
        current = current.children[part];
      });
    });
    return root.children;
  }, [items, rootPath]);

  const renderTree = (nodes: any, depth = 0) => {
    return Object.values(nodes)
      .sort((a: any, b: any) => {
        // Folders first
        if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node: any) => (
        <WikiTreeItem
          key={node.path || node.name + depth}
          node={node}
          depth={depth}
          activeFile={activeFile}
          onSelect={onSelect}
          renderChildren={renderTree}
        />
      ));
  };

  return <div className="space-y-0.5">{renderTree(treeStructure)}</div>;
};

const WikiTreeItem = ({ node, depth, activeFile, onSelect, renderChildren }: any) => {
  const [expanded, setExpanded] = useState(true); // Default expanded
  const isFolder = node.type === 'tree';
  const isActive = node.path === activeFile;
  const isNonMd = !isFolder && !node.name.endsWith('.md');

  const handleClick = () => {
    if (isFolder) {
      setExpanded(!expanded);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tree item click handler */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tree item click handler */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer select-none text-sm transition-colors',
          isActive
            ? 'bg-[#1f6feb] text-white'
            : isNonMd
              ? 'text-[#484f58] hover:bg-[#161b22] hover:text-[#8b949e]'
              : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]',
          !isActive && 'active:bg-[#21262d]',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isFolder && (
          <span className="text-[#8b949e]">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {!isFolder && <FileText size={14} className="opacity-70" />}
        <span className="truncate">{node.name}</span>
      </div>
      {isFolder && expanded && <div>{renderChildren(node.children, depth + 1)}</div>}
    </div>
  );
};

// -- Code Block Component --
const CodeBlock = ({ language, value }: any) => {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-md overflow-hidden bg-[#161b22] border border-[#30363d]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d1117] border-b border-[#30363d]">
        <span className="text-xs text-[#8b949e] font-mono">{language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="p-1 hover:bg-[#21262d] rounded text-[#8b949e] transition-colors"
          title="Copy code"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="!bg-[#161b22] !m-0 !p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{value}</code>
      </pre>
    </div>
  );
};
