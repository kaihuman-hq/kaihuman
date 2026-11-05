import { githubFileStore } from '@kaihuman/core';
import { AlertTriangle, DownloadCloud, FilePen } from 'lucide-preact';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';

export const ConflictModal = () => {
  const fileConflicts = githubFileStore.fileConflicts.value;
  const conflictPaths = Object.keys(fileConflicts);
  const hasConflicts = conflictPaths.length > 0;

  if (!hasConflicts) return null;

  // For simplicity, resolve them one by one
  const currentPath = conflictPaths[0] as string;
  const activeConflict = fileConflicts[currentPath];

  if (!activeConflict) return null;

  const handleResolve = (resolution: 'keep_local' | 'use_remote') => {
    githubFileStore.resolveConflict(currentPath, resolution);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-[var(--los-bg)] border-2 border-orange-500/50 shadow-2xl shadow-orange-500/10 rounded-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header - Warning Theme */}
        <div className="bg-orange-950/20 border-b border-orange-900/30 p-4 flex items-center gap-3">
          <div className="bg-orange-500/20 text-orange-400 p-2 rounded-full shadow-inner">
            <AlertTriangle strokeWidth={2.5} size={24} />
          </div>
          <div>
            <MonoHeader className="text-orange-400 text-lg">FILE CONFLICT DETECTED</MonoHeader>
            <MonoText className="text-[11px] text-[var(--los-muted)]">
              Multiple edits detected on the same file.
            </MonoText>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 flex flex-col gap-6">
          <div className="space-y-1">
            <MonoLabel className="text-[var(--los-muted)]">AFFECTED FILE</MonoLabel>
            <div className="text-sm font-mono text-[var(--los-fg)] bg-[var(--los-panel)] p-2 rounded border border-[var(--los-border)] break-all">
              {currentPath}
            </div>
            <MonoText className="text-[12px] text-[var(--los-fg-dim)] mt-2">
              This file has been modified locally, but a newer version was just found on GitHub. How
              would you like to proceed?
            </MonoText>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            {/* option 1: Keep Local */}
            <button
              type="button"
              onClick={() => handleResolve('keep_local')}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-md border border-[var(--los-border)] bg-[var(--los-panel)] hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] transition-colors group text-left"
            >
              <div className="w-full flex items-center gap-2 mb-1">
                <FilePen
                  size={18}
                  className="text-[var(--los-fg)] group-hover:text-[var(--los-accent)]"
                />
                <MonoLabel className="text-sm text-[var(--los-fg)]">KEEP LOCAL</MonoLabel>
              </div>
              <MonoText className="text-[10px] text-[var(--los-muted)] leading-relaxed w-full">
                Keep the version currently open in your editor. It replaces the remote version shown
                here on your next save; newer remote edits are merged first.
              </MonoText>
            </button>

            {/* option 2: Use Remote */}
            <button
              type="button"
              onClick={() => handleResolve('use_remote')}
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-md border border-[var(--los-border)] bg-[var(--los-panel)] hover:border-orange-500/50 hover:bg-orange-950/20 transition-colors group text-left"
            >
              <div className="w-full flex items-center gap-2 mb-1">
                <DownloadCloud
                  size={18}
                  className="text-[var(--los-fg)] group-hover:text-orange-400"
                />
                <MonoLabel className="text-sm text-[var(--los-fg)]">USE INCOMING</MonoLabel>
              </div>
              <MonoText className="text-[10px] text-[var(--los-muted)] leading-relaxed w-full">
                Discard your uncommitted local changes and load the latest version from GitHub
                instead.
              </MonoText>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
