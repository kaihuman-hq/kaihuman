import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { githubCommitStore } from '@lifosy/core';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { Loader2, GitCommit, ExternalLink } from 'lucide-preact';
import { cn } from '../../utils';

export const CommitsView = () => {
  useEffect(() => {
    githubCommitStore.loadRepoCommits();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isLoading = githubCommitStore.isLoading.value;
  const commits = githubCommitStore.repoCommits.value;
  const error = githubCommitStore.error.value;

  if (isLoading && commits.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="animate-spin text-[var(--los-accent)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-red-500">
        <MonoText>Error loading commits: {error}</MonoText>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[var(--los-bg)] overflow-hidden">
      <div className="p-4 border-b border-[var(--los-border)] flex items-center gap-2">
        <GitCommit className="text-[var(--los-accent)]" size={20} />
        <MonoHeader className="text-xl">Commit History</MonoHeader>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="w-full text-left border-collapse">
          <div className="grid grid-cols-[1fr_150px_180px_100px] gap-4 mb-2 px-4 py-2 border-b border-[var(--los-border)] text-[var(--los-muted)] font-mono text-sm uppercase tracking-wider sticky top-0 bg-[var(--los-bg)] z-10">
            <div>Message</div>
            <div>Author</div>
            <div>Date</div>
            <div>Hash</div>
          </div>

          <div className="space-y-1">
            {commits.map((item) => (
              <div key={item.sha} className="grid grid-cols-[1fr_150px_180px_100px] gap-4 px-4 py-3 hover:bg-[var(--los-accent)]/5 border border-transparent hover:border-[var(--los-accent)]/20 transition-colors rounded-sm group">
                <div className="truncate font-medium text-[var(--los-fg)] flex items-center gap-2">
                  <span title={item.commit.message}>{item.commit.message.split('\n')[0]}</span>
                </div>
                <div className="truncate text-[var(--los-muted)]">{item.commit.author.name}</div>
                <div className="truncate text-[var(--los-muted)] text-xs font-mono pt-1">{formatDate(item.commit.author.date)}</div>
                <div className="flex items-center gap-2">
                  <a
                    href={item.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--los-accent)] hover:underline flex items-center gap-1 opacity-70 hover:opacity-100"
                  >
                    {item.sha.substring(0, 7)}
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {commits.length === 0 && !isLoading && (
          <div className="text-center p-8 text-[var(--los-muted)]">No commits found.</div>
        )}
      </div>
    </div>
  );
};
