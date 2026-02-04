import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { githubCommitStore } from '@lifosy/core';
import { MonoText, MonoHeader } from '../Atoms/Typography';
import { Loader2, History, X } from 'lucide-preact';
import { cn } from '../../utils';

interface FileHistoryViewProps {
  path: string;
  onClose: () => void;
}

export const FileHistoryView = ({ path, onClose }: FileHistoryViewProps) => {
  useEffect(() => {
    githubCommitStore.loadFileCommits(path);
  }, [path]);

  const commits = githubCommitStore.fileCommits.value[path] || [];
  const isLoading = githubCommitStore.isLoading.value;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="absolute inset-0 z-20 bg-[var(--los-bg)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between p-4 border-b border-[var(--los-border)] bg-[var(--los-surface)]">
        <div className="flex items-center gap-2 text-[var(--los-accent)]">
          <History size={18} />
          <MonoHeader className="text-sm">HISTORY: {path}</MonoHeader>
        </div>
        <button onClick={onClose} className="hover:text-[var(--los-accent)] transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && commits.length === 0 ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin text-[var(--los-accent)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {commits.length === 0 ? (
              <div className="text-center text-[var(--los-muted)] py-8">No history found for this file.</div>
            ) : (
              <div className="relative border-l border-[var(--los-border)] ml-3 space-y-6">
                {commits.map((commit) => (
                  <div key={commit.sha} className="ml-6 relative group">
                    <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors ring-4 ring-[var(--los-bg)]" />

                    <div className="bg-[var(--los-surface)] border border-[var(--los-border)] p-3 rounded-sm hover:border-[var(--los-accent)]/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <MonoText className="font-bold text-sm text-[var(--los-fg)] line-clamp-2">
                          {commit.commit.message}
                        </MonoText>
                        <span className="text-[10px] uppercase tracking-wider text-[var(--los-muted)] whitespace-nowrap bg-[var(--los-bg)] px-1 rounded">
                          {commit.sha.substring(0, 7)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-[var(--los-muted)]">
                        <span className="font-medium text-[var(--los-accent)]">{commit.commit.author.name}</span>
                        <span>•</span>
                        <span>{formatDate(commit.commit.author.date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
