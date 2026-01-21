import { h } from 'preact';
import { useState } from 'preact/hooks';
import { MonoHeader, MonoText } from '../Atoms/Typography';

export interface Repository {
  id: string;
  name: string;
  full_name: string;
}

export interface RepositorySelectorProps {
  repositories: Repository[];
  onSelect: (repo: Repository) => void;
  isLoading?: boolean;
}

export const RepositorySelector = ({ repositories, onSelect, isLoading }: RepositorySelectorProps) => {
  const [visibleCount, setVisibleCount] = useState(6);
  const visibleRepos = repositories.slice(0, visibleCount);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0d0d0d] text-[#e0e0e0] p-4 font-mono animate-in fade-in duration-500 overflow-y-auto">
      <div className="max-w-xl w-full flex flex-col items-center py-12">
        <div className="border border-[#333] rounded-full px-6 py-2 mb-8 bg-[#111]">
          <span className="text-sm tracking-[0.2em] font-bold text-[var(--los-accent)]">WELCOME TO LIFE OS</span>
        </div>

        <h1 className="text-4xl mb-2 font-bold uppercase tracking-tight text-center">Select Repository</h1>
        <p className="text-[#666] mb-12 text-center text-sm max-w-lg">
          Choose a GitHub repository to mount as your file system. This will act as the root of your Life OS instance.
        </p>

        {isLoading ? (
          <div className="text-[var(--los-muted)] animate-pulse">Loading repositories...</div>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {visibleRepos.map(r => (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className="flex flex-col items-start p-6 border border-[#333] bg-[#111] hover:bg-[#1a1a1a] hover:border-[#666] transition-all cursor-pointer group text-left w-full rounded-sm relative overflow-hidden"
              >
                <div className="flex justify-between w-full items-start relative z-10">
                  <span className="text-lg font-bold group-hover:translate-x-1 transition-transform">{r.name}</span>
                  <span className="text-[10px] text-[#444] font-mono border border-[#333] px-1 rounded uppercase group-hover:border-[#666] transition-colors">REPO</span>
                </div>
                <span className="text-xs text-[#444] font-mono relative z-10 truncate w-full mt-1">{r.full_name}</span>

                {/* Subtle Hover Effect Background */}
                <div className="absolute inset-0 bg-[var(--los-accent)] opacity-0 group-hover:opacity-5 transition-opacity z-0" />
              </button>
            ))}

            {visibleCount < repositories.length && (
              <button
                onClick={() => setVisibleCount(prev => prev + 6)}
                className="mt-4 py-3 border border-dashed border-[#444] text-[#666] hover:text-[var(--los-fg)] hover:border-[var(--los-fg)] transition-colors uppercase text-xs tracking-widest w-full"
              >
                LOAD MORE REPOSITORIES ({repositories.length - visibleCount} REMAINING)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
