import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { cn } from '../../utils';
import { Search, File, Loader2, X, CornerDownLeft } from 'lucide-preact';
import { MonoLabel, MonoText } from '../Atoms/Typography';

export interface SearchResult {
  name: string;
  path: string;
  url: string;
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
}

export const SearchModal = ({ isOpen, onClose, onSelect, currentRepository = "lifosy/monorepo", githubToken }: SearchModalProps) => {
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

  // Debounced Search
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Search in the specific repository
        const q = encodeURIComponent(`${query} repo:${currentRepository}`);

        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json'
        };

        if (githubToken) {
          headers['Authorization'] = `Bearer ${githubToken}`;
        }

        const res = await fetch(`https://api.github.com/search/code?q=${q}&per_page=10`, {
          headers
        });

        if (res.ok) {
          const data = await res.json();
          setResults(data.items || []);
          setSelectedIndex(0);
        } else {
          console.error('Search failed', res.status, res.statusText);
        }
      } catch (e) {
        console.error('Search error', e);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, currentRepository, githubToken]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex]);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
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
            <span className="text-[10px] text-[var(--los-muted)] border border-[var(--los-border)] px-1.5 rounded-sm">ESC</span>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-2 bg-[var(--los-bg)]">
          {results.length === 0 && query && !loading && (
            <div className="py-8 text-center text-[var(--los-muted)]">
              <MonoText>No results found</MonoText>
            </div>
          )}
          {results.length === 0 && !query && (
            <div className="py-8 text-center text-[var(--los-muted)]">
              <MonoText>Type to search...</MonoText>
            </div>
          )}

          {results.map((item, index) => (
            <div
              key={item.path}
              onClick={() => { onSelect(item); onClose(); }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer transition-colors group",
                index === selectedIndex ? "bg-[var(--los-accent-dim)]" : "hover:bg-[var(--los-accent-dim)]"
              )}
            >
              <File size={16} className={cn(
                "shrink-0",
                index === selectedIndex ? "text-[var(--los-accent)]" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
              )} />
              <div className="flex flex-col min-w-0 flex-1">
                <span className={cn(
                  "text-sm truncate font-mono",
                  index === selectedIndex ? "text-[var(--los-fg)]" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
                )}>
                  {item.name}
                </span>
                <span className="text-[10px] text-[var(--los-muted)] truncate opacity-60">
                  {item.path}
                </span>
              </div>
              {index === selectedIndex && (
                <CornerDownLeft size={14} className="text-[var(--los-accent)] opacity-50" />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 border-t border-[var(--los-border)] bg-[var(--los-panel)] flex justify-between items-center">
          <MonoText className="text-[10px] text-[var(--los-muted)]">GitHub Search API</MonoText>
          <MonoText className="text-[10px] text-[var(--los-muted)]">{results.length} results</MonoText>
        </div>

      </div>
    </div>
  );
};
