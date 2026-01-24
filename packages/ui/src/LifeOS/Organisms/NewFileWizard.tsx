import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoText, MonoLabel } from '../Atoms/Typography';
import {
  FileText,
  Rss,
  ListTodo,
  Calendar,
  Activity,
  Globe,
  Bookmark,
  Folder,
  ChevronRight,
  ArrowRight,
  X
} from 'lucide-preact';
import { TileDef } from '../Layouts/MainApp';

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
    id: 'rss',
    name: 'RSS Reader',
    description: 'Follow your favorite news feeds',
    icon: Rss,
    extension: '.rss.json',
    defaultContent: JSON.stringify({ feeds: [], readItems: [] }, null, 2)
  },
  {
    id: 'todo',
    name: 'Todo List',
    description: 'Track tasks and progress',
    icon: ListTodo,
    extension: '.todos.md',
    defaultContent: '# Tasks\n\n- [ ] New Task'
  },
  {
    id: 'events',
    name: 'Events',
    description: 'Upcoming events and schedule',
    icon: Calendar,
    extension: '.events.csv',
    defaultContent: 'id,title,date,type,description\n'
  },
  {
    id: 'habit',
    name: 'Habit Tracker',
    description: 'Track daily habits and streaks',
    icon: Activity,
    extension: '.habit.csv',
    defaultContent: 'id,title,frequency,target,history\n'
  },
  {
    id: 'timezone',
    name: 'Timezones',
    description: 'Track time across the world',
    icon: Globe,
    extension: '.timezones.json',
    defaultContent: '[]'
  },
  {
    id: 'readitlater',
    name: 'Read It Later',
    description: 'Save articles for later',
    icon: Bookmark,
    extension: '.readitlater.json',
    defaultContent: JSON.stringify({ items: [] }, null, 2)
  },
  {
    id: 'note',
    name: 'Note',
    description: 'Markdown note',
    icon: FileText,
    extension: '.md',
    defaultContent: ''
  }
];

export interface NewFileWizardProps {
  onClose: () => void;
  onCreate: (path: string, content: string) => void;
  fileSystem?: { columns: { items: TileDef[] }[] }; // Simplified file system view
  availableFolders?: string[]; // List of available folders (paths relative to root)
}

export const NewFileWizard = ({ onClose, onCreate, fileSystem, availableFolders = [] }: NewFileWizardProps) => {
  const [step, setStep] = useState<'TEMPLATE' | 'LOCATION'>('TEMPLATE');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>(''); // Empty string means root

  // Helper to drill down into file system based on currentPath
  // This logic is currently placeholder as full tree traversal requires more context or utils
  const currentFolderItems = useMemo(() => {
    return [];
  }, [fileSystem, currentPath]);

  const handleCreate = () => {
    if (!selectedTemplate || !filename) return;

    // Sanitize filename
    const name = filename.trim();
    if (!name) return;

    // Construct full path
    const folderPrefix = selectedFolder ? (selectedFolder.endsWith('/') ? selectedFolder : `${selectedFolder}/`) : '';
    const fullPath = `${folderPrefix}${name}${selectedTemplate.extension}`;

    onCreate(fullPath, selectedTemplate.defaultContent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-[var(--los-bg)] border border-[var(--los-border)] w-full max-w-2xl h-[80vh] md:h-[600px] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">

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
            onClick={onClose}
            className="hover:text-[var(--los-accent)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'TEMPLATE' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {TEMPLATES.map(t => (
                <button
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
          ) : (
            <div className="flex flex-col gap-8 max-w-md mx-auto mt-8">
              <div className="flex items-center gap-4 p-4 border border-[var(--los-border)] bg-[var(--los-accent)]/5">
                {(() => {
                  // Fix for JSX syntax error: Extract icon to variable
                  const Icon = selectedTemplate?.icon;
                  return Icon ? <Icon size={32} className="text-[var(--los-accent)]" /> : null;
                })()}
                <div>
                  <MonoLabel className="text-[var(--los-accent)]">{selectedTemplate!.name}</MonoLabel>
                  <MonoText className="text-xs text-[var(--los-muted)]">{selectedTemplate!.description}</MonoText>
                </div>
                <button
                  onClick={() => setStep('TEMPLATE')}
                  className="ml-auto text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)] underline"
                >
                  CHANGE
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <MonoLabel>FILE LOCATION</MonoLabel>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Folder size={16} className="text-[var(--los-muted)]" />
                    </div>
                    <select
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.currentTarget.value)}
                      className="w-full pl-10 pr-10 py-3 bg-[var(--los-bg)] border border-[var(--los-border)] text-[var(--los-fg)] appearance-none focus:outline-none focus:border-[var(--los-accent)] rounded-none cursor-pointer"
                    >
                      <option value="">root /</option>
                      {availableFolders.map(folder => (
                        <option key={folder} value={folder}>{folder}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--los-muted)]">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--los-muted)]">
                    Select a folder to create the file in.
                  </p>
                </div>

                <div className="space-y-2">
                  <MonoLabel>FILENAME</MonoLabel>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={filename}
                      onInput={(e) => setFilename(e.currentTarget.value)}
                      placeholder="my-new-file"
                      autoFocus
                      className="flex-1 bg-transparent border-b border-[var(--los-border)] py-2 text-xl font-mono text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)] placeholder:text-[var(--los-muted)]/20"
                    />
                    <span className="text-[var(--los-muted)] font-mono ml-2">{selectedTemplate!.extension}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={!filename}
                className="mt-8 bg-[var(--los-accent)] text-black font-bold py-3 px-6 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                <span>CREATE FILE</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
