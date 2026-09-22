import { encrypt, Logger, passwordStore } from '@lifosy/core';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Calendar,
  ClipboardList,
  Database,
  FileText,
  Globe,
  Kanban,
  ListTodo,
  Lock,
  MessageSquareQuote,
  Rss,
  Star,
  TrendingUp,
  X,
  Zap,
} from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';
import type { TileDef } from '../Layouts/MainApp';
import { type FolderItem, FolderSelector } from './FolderSelector';

const logger = new Logger('NewFileWizard');

interface Template {
  id: string;
  name: string;
  description: string;
  icon: any;
  extension: string;
  defaultContent: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'note',
    name: 'Note',
    description: 'Markdown note',
    icon: FileText,
    extension: '.md',
    defaultContent: '',
  },
  {
    id: 'actionlog',
    name: 'Action Log',
    description: 'Log actions, events, and notes with tags',
    icon: ClipboardList,
    extension: '.actionlog.md',
    defaultContent: '---\n---\n\n# Action Log\n\n',
  },
  {
    id: 'prompts',
    name: 'Prompts',
    description: 'A searchable library of reusable prompts with tags',
    icon: MessageSquareQuote,
    extension: '.prompts.md',
    defaultContent: '# Prompts\n',
  },
  {
    id: 'todo',
    name: 'Todo List',
    description: 'Track tasks and progress',
    icon: ListTodo,
    extension: '.todos.md',
    defaultContent: '- [ ] New Task',
  },
  {
    id: 'data-collection',
    name: 'Data Collection',
    description: 'Track custom metrics and data',
    icon: Database,
    extension: '.data-collection.csv',
    defaultContent: 'name::created,type::auto:date;name::Value,type::number,unit::#\n',
  },
  {
    id: 'habit',
    name: 'Habit Tracker',
    description: 'Track daily habits and streaks',
    icon: Activity,
    extension: '.habit.csv',
    defaultContent: 'id,title,frequency,target,history\n',
  },
  {
    id: 'rss',
    name: 'RSS Reader',
    description: 'Follow your favorite news feeds',
    icon: Rss,
    extension: '.rss.json',
    defaultContent: JSON.stringify({ feeds: [], readItems: [] }, null, 2),
  },
  {
    id: 'events',
    name: 'Events',
    description: 'Upcoming events and schedule',
    icon: Calendar,
    extension: '.events.csv',
    defaultContent: 'id,title,date,type,description\n',
  },
  {
    id: 'consumption',
    name: 'Consumption Tracker',
    description:
      'Track daily meter readings (electricity, gas, water, solar) with monthly/yearly reports',
    icon: Zap,
    extension: '.consumption.csv',
    // Column format: Name[title:Display;unit:Unit;yearlyTarget:Number]
    defaultContent: 'created\n',
  },
  {
    id: 'stocks',
    name: 'Stocks / Portfolio',
    description: 'Track portfolio value and investment over time with charts and forecast',
    icon: TrendingUp,
    extension: '.stocks.csv',
    defaultContent: '',
  },
  {
    id: 'timezone',
    name: 'Timezones',
    description: 'Track time across the world',
    icon: Globe,
    extension: '.timezones.json',
    defaultContent: '[]',
  },
  {
    id: 'readitlater',
    name: 'Read It Later',
    description: 'Save articles for later',
    icon: Bookmark,
    extension: '.readitlater.json',
    defaultContent: JSON.stringify({ items: [] }, null, 2),
  },
  {
    id: 'bookmarks',
    name: 'Bookmarks',
    description: 'Tagged, searchable bookmarks. Synced into the browser extension.',
    icon: Star,
    extension: '.bookmarks.json',
    defaultContent: JSON.stringify({ bookmarks: [], updatedAt: '' }, null, 2),
  },
  {
    id: 'board-overview',
    name: 'Board Overview',
    description:
      'Dashboard widget showing inbox, in-progress, and overdue counts. Opens the Board on click.',
    icon: Kanban,
    extension: '.board-overview.json',
    defaultContent: '{}',
  },
];

export interface NewFileWizardProps {
  onClose: () => void;
  onCreate: (path: string, content: string) => void;
  fileSystem?: { columns: { items: TileDef[] }[] }; // We use this to derive initial folder state
  availableFolders?: string[]; // Legacy, unused now in favor of recursive load
  // We need a way to check file existence. Ideally passed in.
  existingFiles?: string[];
  // Callback to load children for folder selector
  onLoadFolder?: (path: string) => Promise<TileDef[]>;
  initialStep?: 'TEMPLATE' | 'LOCATION';
  initialContent?: string;
  initialFilename?: string;
  initialFolder?: string;
}

export const NewFileWizard = ({
  onClose,
  onCreate,
  fileSystem,
  availableFolders: _availableFolders = [],
  existingFiles = [],
  onLoadFolder,
  initialStep = 'TEMPLATE',
  initialContent,
  initialFilename = '',
  initialFolder = '',
}: NewFileWizardProps) => {
  const [step, setStep] = useState<'TEMPLATE' | 'LOCATION'>(initialStep);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(() => {
    if (initialContent) {
      // Default to Note template for dumps, or find generic md
      const noteTemplate = TEMPLATES.find((t) => t.id === 'note');
      // Ensure we return Template or null, never undefined
      return noteTemplate || TEMPLATES[0] || null;
    }
    return null;
  });
  const [filename, setFilename] = useState(initialFilename);
  const [selectedFolder, setSelectedFolder] = useState<string>(initialFolder); // Empty string means root

  // Encryption State
  const [encryptFile, setEncryptFile] = useState(false);
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);

  // Validation State
  const [error, setError] = useState<string | null>(null);

  // Derive root folders from fileSystem or availableFolders if not provided
  const rootItems = useMemo<FolderItem[]>(() => {
    // If we have a fileSystem prop (from MainApp), use its first column
    if (fileSystem && fileSystem.columns.length > 0 && fileSystem.columns[0]) {
      return fileSystem.columns[0].items
        .filter((item) => item.type === 'FOLDER')
        .map((item) => ({
          id: String(item.id), // full path
          name: item.title,
          hasChildren: true, // Assume true for simplicity or check if we can know
        }));
    }
    // Fallback? Or empty.
    return [];
  }, [fileSystem]);

  // Adapter for FolderSelector to load children
  const handleLoadFolder = async (path: string): Promise<FolderItem[]> => {
    if (onLoadFolder) {
      const items = await onLoadFolder(path);
      return items
        .filter((item) => item.type === 'FOLDER')
        .map((item) => ({
          id: String(item.id),
          name: item.title,
          hasChildren: true,
        }));
    }
    return [];
  };

  const fullPath = useMemo(() => {
    if (!selectedTemplate || !filename) return '';
    const folderPrefix = selectedFolder
      ? selectedFolder.endsWith('/')
        ? selectedFolder
        : `${selectedFolder}/`
      : '';
    const ext = `${selectedTemplate.extension}${encryptFile ? '.enc' : ''}`;
    return `${folderPrefix}${filename.trim()}${ext}`;
  }, [selectedFolder, filename, selectedTemplate, encryptFile]);

  // Validate on change
  useEffect(() => {
    if (!filename) {
      setError(null);
      return;
    }
    // Check duplication
    // We need to know if fullPath exists in existingFiles
    // But existingFiles might be just a list of paths.
    // If existingFiles prop is passed (we'll need to update MainApp to pass it), we check against it.

    // For now, if existingFiles is empty, we might skip or try to look at fileSystem.
    // Ideally MainApp passes all known file paths.
    if (existingFiles.includes(fullPath)) {
      setError('File already exists at this location.');
    } else {
      setError(null);
    }
  }, [fullPath, existingFiles, filename]);

  const handleCreate = async () => {
    if (!selectedTemplate || !filename || error) return;
    if (encryptFile && !password) {
      setError('Password is required for encrypted files.');
      return;
    }

    // Disable UI safely
    setError(null);
    try {
      let content = initialContent || selectedTemplate.defaultContent;
      if (encryptFile) {
        content = await encrypt(content, password);
        passwordStore.setPassword(fullPath, password, rememberPassword);
      }
      onCreate(fullPath, content);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Encryption failed.');
      logger.error('Encryption failed', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[var(--los-bg)] border border-[var(--los-border)] w-full max-w-3xl h-[80vh] md:h-[650px] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-14 border-b border-[var(--los-border)] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <MonoHeader>NEW FILE</MonoHeader>
            <span className="text-[var(--los-muted)]">/</span>
            <MonoText className="text-[var(--los-accent)]">
              {step === 'TEMPLATE' ? 'SELECT TEMPLATE' : 'Review & Create'}
            </MonoText>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-[var(--los-accent)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'TEMPLATE' ? (
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={templateSearch}
                onInput={(e) => setTemplateSearch(e.currentTarget.value)}
                placeholder="Search templates..."
                className="w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-3 py-2 text-sm font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {TEMPLATES.filter(
                  (t) =>
                    !templateSearch ||
                    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    t.description.toLowerCase().includes(templateSearch.toLowerCase()),
                ).map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => {
                      setSelectedTemplate(t);
                      setStep('LOCATION');
                    }}
                    className="flex flex-col items-start gap-4 p-4 border border-[var(--los-border)] hover:border-[var(--los-accent)] hover:bg-[var(--los-accent)]/5 transition-all text-left group"
                  >
                    <div className="p-2 bg-[var(--los-bg)] border border-[var(--los-border)] rounded-md group-hover:border-[var(--los-accent)] group-hover:text-[var(--los-accent)] transition-colors">
                      <t.icon size={24} />
                    </div>
                    <div>
                      <MonoLabel className="text-base group-hover:text-[var(--los-accent)] transition-colors block mb-1">
                        {t.name}
                      </MonoLabel>
                      <p className="text-xs text-[var(--los-muted)] leading-relaxed">
                        {t.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto mt-4 px-4">
              <div className="flex items-center gap-4 p-4 border border-[var(--los-border)] bg-[var(--los-accent)]/5">
                {(() => {
                  const Icon = selectedTemplate?.icon;
                  return Icon ? <Icon size={32} className="text-[var(--los-accent)]" /> : null;
                })()}
                <div>
                  <MonoLabel className="text-[var(--los-accent)]">
                    {selectedTemplate?.name}
                  </MonoLabel>
                  <MonoText className="text-xs text-[var(--los-muted)]">
                    {selectedTemplate?.description}
                  </MonoText>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('TEMPLATE')}
                  className="ml-auto text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)] underline"
                >
                  CHANGE
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <MonoLabel>FILENAME</MonoLabel>
                  <div className="flex items-center relative">
                    <input
                      type="text"
                      value={filename}
                      onInput={(e) => setFilename(e.currentTarget.value)}
                      placeholder="my-new-file"
                      className={cn(
                        'flex-1 bg-transparent border-b py-2 text-xl font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/20',
                        error
                          ? 'border-red-500'
                          : 'border-[var(--los-border)] focus:border-[var(--los-accent)]',
                      )}
                    />
                    <span className="text-[var(--los-muted)] font-mono ml-2 whitespace-nowrap">
                      {selectedTemplate?.extension}
                      {encryptFile ? <span className="text-[var(--los-accent)]">.enc</span> : ''}
                    </span>
                  </div>
                  {error && (
                    <div className="text-red-500 text-xs flex items-center gap-1 mt-1 animate-in slide-in-from-top-1">
                      <AlertTriangle size={12} />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <MonoLabel>LOCATION</MonoLabel>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedFolder('')}
                        className="text-[10px] text-[var(--los-muted)] hover:text-[var(--los-accent)] uppercase border border-[var(--los-border)] px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                      >
                        Select Root
                      </button>
                      <MonoText className="text-xs text-[var(--los-muted)]">
                        Selected:{' '}
                        <span className="text-[var(--los-fg)]">{selectedFolder || '/ (root)'}</span>
                      </MonoText>
                    </div>
                  </div>

                  <FolderSelector
                    rootItems={rootItems}
                    onLoadFolder={handleLoadFolder}
                    onSelect={setSelectedFolder}
                    selectedPath={selectedFolder}
                    className="w-full"
                  />
                  <p className="text-[10px] text-[var(--los-muted)]">
                    Navigate through folders to select a destination. Initial view shows root
                    folders.
                  </p>
                </div>

                {/* Encryption Configuration */}
                <div className="space-y-4 pt-4 border-t border-[var(--los-border)]">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={encryptFile}
                      onChange={(e) => setEncryptFile(e.currentTarget.checked)}
                      className="accent-[var(--los-accent)] cursor-pointer"
                    />
                    <Lock
                      size={14}
                      className={
                        encryptFile
                          ? 'text-[var(--los-accent)]'
                          : 'text-[var(--los-muted)] group-hover:text-[var(--los-accent)] transition-colors'
                      }
                    />
                    <MonoLabel
                      className={
                        encryptFile
                          ? 'text-[var(--los-fg)]'
                          : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)] transition-colors'
                      }
                    >
                      Encrypt Content
                    </MonoLabel>
                  </label>

                  {encryptFile && (
                    <div className="space-y-4 pl-6 animate-in slide-in-from-top-2 fade-in duration-200 border-l border-[var(--los-border)] ml-1">
                      <div className="space-y-2">
                        <MonoLabel>PASSWORD</MonoLabel>
                        <input
                          type="password"
                          value={password}
                          onInput={(e) => setPassword(e.currentTarget.value)}
                          placeholder="SuperSecretPassword123"
                          className="w-full bg-transparent border-b py-2 text-xl font-mono text-[var(--los-fg)] border-[var(--los-border)] focus:border-[var(--los-accent)] focus:outline-none placeholder:text-[var(--los-muted)]/20"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer group w-max mt-2">
                        <input
                          type="checkbox"
                          checked={rememberPassword}
                          onChange={(e) => setRememberPassword(e.currentTarget.checked)}
                          className="accent-[var(--los-accent)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--los-muted)] group-hover:text-[var(--los-fg)] transition-colors font-mono uppercase">
                          Remember in Browser (Local Storage)
                        </span>
                      </label>
                      <p className="text-[10px] text-[var(--los-muted)] leading-relaxed max-w-lg">
                        Encryption is performed using standard AES-GCM via the Web Crypto API. If
                        you lose your password, the data cannot be recovered. Unless "Remember in
                        Browser" is checked, the password will only be preserved for this session.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Create File button, only shown on LOCATION step */}
        {step === 'LOCATION' && (
          <div className="shrink-0 border-t border-[var(--los-border)] px-6 py-4 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!filename || !!error || (encryptFile && !password)}
              className="bg-[var(--los-accent)] text-black font-bold py-3 px-6 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity w-full sm:w-auto"
            >
              <span>CREATE FILE</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
