import { h } from 'preact';
import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import ForceGraph2D from 'react-force-graph-2d';
import { githubFileStore, githubService, githubProfileStore } from '@lifosy/core';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { Loader2, Share2, RefreshCw } from 'lucide-preact';
import { cn } from '../../utils';

// Helper to find links in markdown
const findLinks = (content: string): string[] => {
  const links: string[] = [];
  // Wiki links [[...]]
  const wikiRegex = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = wikiRegex.exec(content)) !== null) {
    if (match && match[1]) {
      // Extract path, ignore alias like [[path|alias]]
      const linkPath = match[1].split('|')[0];
      if (linkPath) links.push(linkPath);
    }
  }

  // Standard links [text](path)
  const stdRegex = /\[.*?\]\((.*?)\)/g;
  while ((match = stdRegex.exec(content)) !== null) {
    const link = match[1];
    if (link && !link.startsWith('http')) {
      links.push(link);
    }
  }
  return links;
};

export const GraphView = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedCount, setAnalyzedCount] = useState(0);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      if (!entries || !entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;

  // Build Graph Data
  const graphData = useMemo(() => {
    const nodes = tree
      .filter(t => t.path.endsWith('.md'))
      .map(t => ({
        id: t.path,
        name: t.path.split('/').pop() || t.path,
        val: 1 // Default size
      }));

    const links: { source: string; target: string }[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // Iterate over all OPEN files (or cached ones if we had access to full cache synchronously)
    // githubFileStore.openFiles only has currently 'open' files.
    // Ideally we want to scan ALL files.

    // For this MVP, we scan what we have in memory (openFiles).
    // The "Analyze" button below will populate openFiles (or a separate cache).

    Object.entries(openFiles).forEach(([path, file]) => {
      if (!path.endsWith('.md')) return;
      if (!nodeIds.has(path)) return; // File not in tree?

      // Scale node based on connections (degree) - simplified here
      // nodes.find(n => n.id === path)!.val += 1; // self-importance?

      const extractedLinks = findLinks(file.content);
      extractedLinks.forEach(link => {
        // Resolve link to path
        // Simple resolution: exact match or relative?
        // Assuming simplified exact match or relative from root for now.
        // Improve resolution logic as needed.

        // Try exact match
        let target = link;
        if (!nodeIds.has(target)) {
          // Try resolving relative? or appending .md?
          if (nodeIds.has(`${target}.md`)) target = `${target}.md`;
          // Try just filename match?
          else {
            const found = nodes.find(n => n.name === target || n.name === `${target}.md`);
            if (found) target = found.id;
          }
        }

        if (nodeIds.has(target) && target !== path) {
          links.push({ source: path, target });
        }
      });
    });

    return { nodes, links };
  }, [tree, openFiles]);

  const handleAnalyzeAll = async () => {
    setIsAnalyzing(true);
    setAnalyzedCount(0);
    const mdFiles = tree.filter(t => t.path.endsWith('.md'));
    const repo = githubProfileStore.currentRepo.value;

    if (!repo) return;

    // Batch fetch?
    // We'll use githubFileStore.openFile to fetch and cache.
    // But openFile sets activeFile, which might be annoying (flickering UI).
    // Better to use githubService directly and update cache/store silently?
    // Reuse openFile for now but maybe suppress active switch? 
    // Actually githubFileStore.openFile puts it in openFiles map. 

    // Concurrency limit: 5
    const limit = 5;
    const queue = [...mdFiles];
    let active = 0;

    const processNext = async () => {
      if (queue.length === 0) return;
      active++;
      const file = queue.shift();
      if (file) {
        try {
          // Check if already loaded
          if (!openFiles[file.path]) {
            await githubFileStore.openFile(file.path);
          }
        } catch (e) {
          console.warn("Failed to analyze", file.path);
        }
        setAnalyzedCount(prev => prev + 1);
      }
      active--;
      if (queue.length > 0) await processNext();
    };

    const workers = [];
    for (let i = 0; i < limit; i++) workers.push(processNext());

    await Promise.all(workers);
    setIsAnalyzing(false);
  };

  return (
    <div className="h-full w-full flex flex-col bg-[var(--los-bg)] overflow-hidden">
      <div className="p-4 border-b border-[var(--los-border)] flex items-center justify-between text-[var(--los-fg)] bg-[var(--los-surface)] z-10">
        <div className="flex items-center gap-2">
          <Share2 className="text-[var(--los-accent)]" size={20} />
          <MonoHeader className="text-xl">Knowledge Graph</MonoHeader>
          <span className="text-xs text-[var(--los-muted)] ml-2 font-mono">
            {graphData.nodes.length} Nodes • {graphData.links.length} Links
          </span>
        </div>
        <button
          onClick={handleAnalyzeAll}
          disabled={isAnalyzing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          {isAnalyzing ? `Analyzing ${analyzedCount}...` : 'Analyze All Links'}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 relative cursor-move">
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)" // Transparent, let parent bg show
          nodeLabel="name"
          nodeColor={() => 'var(--los-accent)'} // CSS var doesn't work directly in canvas usually? 
          // Colors need to be hex strings usually for canvas.
          // Let's hardcode a nice color or compute it.
          // Fallback to a concrete color if vars fail. 
          nodeRelSize={6}
          linkColor={() => '#3f3f46'} // zinc-700
          onNodeClick={(node: any) => onNavigate(node.id)}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />

        {graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <MonoText className="text-[var(--los-muted)] bg-[var(--los-bg)] p-2">
              No Markdown files found.
            </MonoText>
          </div>
        )}
      </div>
    </div>
  );
};
