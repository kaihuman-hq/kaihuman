import { h } from 'preact';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';
import { X, ArrowRight, Folder, AlertTriangle } from 'lucide-preact';
import { FolderSelector, FolderItem } from './FolderSelector';
import { TileDef } from '../Layouts/MainApp';

export interface MoveFileModalProps {
  fileToMove: string; // The full path of file being moved
  onClose: () => void;
  onMove: (oldPath: string, newPath: string) => Promise<void>;

  // File System Access for Folder Selector
  fileSystem?: { columns: { items: TileDef[] }[] };
  onLoadFolder?: (path: string) => Promise<TileDef[]>;
}

export const MoveFileModal = ({
  fileToMove,
  onClose,
  onMove,
  fileSystem,
  onLoadFolder
}: MoveFileModalProps) => {
  // Extract filename from path
  const originalFilename = useMemo(() => fileToMove.split('/').pop() || '', [fileToMove]);
  // Extract original folder
  const originalFolder = useMemo(() => {
    const parts = fileToMove.split('/');
    parts.pop();
    return parts.join('/');
  }, [fileToMove]);

  const [selectedFolder, setSelectedFolder] = useState<string>(originalFolder);
  const [filename, setFilename] = useState<string>(originalFilename);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive root items
  const rootItems = useMemo<FolderItem[]>(() => {
    if (fileSystem && fileSystem.columns.length > 0 && fileSystem.columns[0]) {
      return fileSystem.columns[0].items
        .filter(item => item.type === 'FOLDER')
        .map(item => ({
          id: String(item.id),
          name: item.title,
          hasChildren: true
        }));
    }
    return [];
  }, [fileSystem]);

  const handleLoadFolder = async (path: string): Promise<FolderItem[]> => {
    if (onLoadFolder) {
      const items = await onLoadFolder(path);
      return items
        .filter(item => item.type === 'FOLDER')
        .map(item => ({
          id: String(item.id),
          name: item.title,
          hasChildren: true
        }));
    }
    return [];
  };

  const newPath = useMemo(() => {
    const prefix = selectedFolder ? (selectedFolder.endsWith('/') ? selectedFolder : `${selectedFolder}/`) : '';
    return `${prefix}${filename}`;
  }, [selectedFolder, filename]);

  const handleMove = async () => {
    if (newPath === fileToMove) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await onMove(fileToMove, newPath);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to move file");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-[var(--los-bg)] border border-[var(--los-border)] w-full max-w-2xl flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="h-14 border-b border-[var(--los-border)] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <MonoHeader>MOVE FILE</MonoHeader>
            <span className="text-[var(--los-muted)]">/</span>
            <MonoText className="text-[var(--los-accent)]">{originalFilename}</MonoText>
          </div>
          <button
            onClick={onClose}
            className="hover:text-[var(--los-accent)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Filename Input (Rename while moving) */}
          <div className="space-y-2">
            <MonoLabel>FILENAME</MonoLabel>
            <div className="flex items-center relative">
              <input
                type="text"
                value={filename}
                onInput={(e) => setFilename(e.currentTarget.value)}
                className="w-full bg-transparent border-b border-[var(--los-border)] py-2 text-lg font-mono text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)]"
              />
            </div>
          </div>

          {/* Folder Selector */}
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <MonoLabel>DESTINATION FOLDER</MonoLabel>
              <MonoText className="text-xs text-[var(--los-muted)]">
                Selected: <span className="text-[var(--los-fg)]">{selectedFolder || '/ (root)'}</span>
              </MonoText>
            </div>
            <FolderSelector
              rootItems={rootItems}
              onLoadFolder={handleLoadFolder}
              onSelect={setSelectedFolder}
              selectedPath={selectedFolder}
              className="w-full h-48"
            />
          </div>

          {error && (
            <div className="text-red-500 text-xs flex items-center gap-1">
              <AlertTriangle size={12} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 hover:bg-white/5 border border-transparent hover:border-[var(--los-border)] transition-all"
            >
              CANCEL
            </button>
            <button
              onClick={handleMove}
              disabled={isSubmitting || !filename}
              className="bg-[var(--los-accent)] text-black font-bold px-6 py-2 flex items-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <span>MOVE</span>
              <ArrowRight size={16} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
