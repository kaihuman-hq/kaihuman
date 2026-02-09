import { Logger } from '../logger.js';
import { signal, computed, effect } from '@preact/signals';
import { TileDef, Column, DashboardConfig } from '../models/types.js';
import { githubFileStore } from './github-file.store.js';

export type ViewMode = 'DASHBOARD' | 'FILES' | 'GRAPH' | 'COMMITS' | 'SETTINGS' | 'WIKI';
export type FocusViewMode = 'CODE' | 'WIDGET' | 'PREVIEW' | 'CHARTS' | 'ADD' | 'ACCOUNTS' | 'TABLE' | 'COLUMNS' | 'FEEDS' | 'ARCHIVE';

export interface DumpSaveProps {
  initialContent: string;
  initialFilename: string;
  initialFolder: string;
  initialStep: 'LOCATION' | string;
}

export class LayoutStore {
  private logger = new Logger('LayoutStore');
  // Main Navigation State
  view = signal<ViewMode>('DASHBOARD');
  activeTileId = signal<string | null>(null); // Re-ordered for clarity

  activeDashboardId = signal<string | null>(null);

  // Miller Columns State
  columns = signal<Column[]>([]);
  remoteConfig = signal<DashboardConfig | null>(null);

  // Focus Mode State
  activeTileMap = signal<Map<string, boolean>>(new Map());
  focusViewMode = signal<FocusViewMode>('CODE');

  // Wiki State
  activeWikiRoot = signal<string | null>(null);

  // UI Preferences
  zenMode = signal<boolean>(false);
  showDumpMode = signal<boolean>(false);
  showNewFileWizard = signal<boolean>(false);
  showSearch = signal<boolean>(false);
  showAddToDashboard = signal<boolean>(false);

  // Transient Data
  fileToMove = signal<string | null>(null);
  fileToAddToDashboard = signal<string | null>(null);
  dragEnabled = signal<boolean>(false);
  activeDragId = signal<string | number | null>(null);
  notFound = signal<boolean>(false);

  // Dump Mode Specifics
  dumpContent = signal<string>('');
  dumpSaveProps = signal<DumpSaveProps | null>(null);

  // Resize State
  expandedTiles = signal<Set<string>>(new Set());

  constructor() {
    // Log View Changes
    effect(() => {
      this.logger.debug(`[StateChange] view changed to: ${this.view.value}`);
    });

    // Log Active Tile Changes
    effect(() => {
      this.logger.debug(`[StateChange] activeTileId changed to: ${this.activeTileId.value}`);
    });

    // Sync Columns with Tree (Reactive)
    effect(() => {
      const tree = githubFileStore.tree.value;
      // Removed openFiles dependency to prevent re-render loops when files are opened
      // Content updates should be handled by components subscribing to the store directly

      if (tree.length > 0) {
        // Use peek() to read current columns without subscribing, preventing cycles
        const currentCols = this.columns.peek();

        // If no columns, initialize root
        if (currentCols.length === 0) {
          this.columns.value = [{ items: this.getChildren(''), activeId: null }];
        } else {
          // Refresh existing columns preserving path
          this.columns.value = currentCols.map((col, idx) => {
            let prefix = '';
            if (idx > 0) {
              const parentCol = currentCols[idx - 1];
              if (parentCol?.activeId) prefix = `${parentCol.activeId}/`;
              else return col;
            }
            return { ...col, items: this.getChildren(prefix) };
          });
        }
      } else {
        this.columns.value = [];
      }
    });
  }

  // --- ACTIONS ---

  // Helper to get children (Logic moved from Dashboard)
  public getChildren(prefix: string): TileDef[] {
    const currentTree = githubFileStore.tree.value;
    if (!currentTree) return [];

    const items = currentTree.filter((item) => {
      if (!prefix) return !item.path.includes('/');
      return (
        item.path.startsWith(prefix) &&
        item.path.slice(prefix.length).split('/').length === 1 &&
        item.path !== prefix
      );
    });

    items.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });

    return items.map((item) => {
      // Determine extensions/types
      const isTimeTracking = item.path.toLowerCase().endsWith('.timetracking.csv');
      const isEvents = item.path.toLowerCase().endsWith('.events.csv');
      const isHabit = item.path.toLowerCase().endsWith('.habit.csv');
      const isTimezones = item.path.toLowerCase().endsWith('.timezones.json');
      const isRss = item.path.toLowerCase().endsWith('.rss.json');
      const isReadItLater = item.path.toLowerCase().endsWith('.readitlater.json');
      const isBudget = item.path.toLowerCase().endsWith('.budget.csv');
      const isActionLog = item.path.toLowerCase().endsWith('.actionlog.md');
      const isDataCollection = item.path.toLowerCase().endsWith('.data-collection.csv');

      const tile: TileDef = {
        id: item.path,
        title: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'FOLDER' : 'FILE',
        // content: null, // Core TileDef doesn't have content
        extension: item.path.includes('.') ? `.${item.path.split('.').pop()}` : undefined
      };

      // In Core, we don't set UI content. MainApp handles that.
      // We DO set rawContent if file is open.
      const openFiles = githubFileStore.openFiles.value;

      const isWidget = isTimeTracking || isEvents || isHabit || isTimezones || isRss || isReadItLater || isBudget || isActionLog || isDataCollection;

      if (isWidget && openFiles && openFiles[item.path]) {
        tile.rawContent = openFiles[item.path]?.content;
      }

      // Handlers
      if (isWidget) {
        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          // Local update happens via store reactivity now!
          // (Store updates -> Tree/OpenFiles updates -> Effect triggers -> getChildren called -> rawContent updated)
        };
      }

      return tile;
    });
  }

  resetToRoot() {
    this.columns.value = [{ items: this.getChildren(''), activeId: null }];
  }

  navigate(id: string) {
    // Find item in tree to getType
    const item = githubFileStore.tree.value.find(i => i.path === id);
    if (!item) return;

    const isFolder = item.type === 'tree';

    // Check if already in columns
    const cols = this.columns.value;
    const colIndex = cols.findIndex(col => col.items.some(i => i.id === id));

    // Optimization: If already active and focused, do nothing to prevent loops
    if (this.activeTileId.peek() === id && colIndex !== -1) {
      return;
    }

    if (colIndex === -1) {
      // Deep link navigation logic
      const newColumns: Column[] = [];
      const parts = id.split('/');

      // 1. Root Column
      const rootChildren = this.getChildren('');
      const rootActiveId = (parts.length > 1 ? parts[0] : id) || '';
      if (rootChildren.some(i => i.id === rootActiveId)) {
        newColumns.push({ items: rootChildren, activeId: rootActiveId });
      } else {
        // Fallback
        this.resetToRoot();
        return;
      }

      // 2. Intermediate Columns
      let currentPath = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const children = this.getChildren(currentPath + '/');
        let activeId = '';
        if (i === parts.length - 1) {
          activeId = id;
        } else {
          activeId = currentPath + '/' + parts[i];
        }
        newColumns.push({ items: children, activeId });
        currentPath += '/' + parts[i];
      }

      // 3. Final expansion if folder
      if (isFolder) {
        const children = this.getChildren(id + '/');
        newColumns.push({ items: children, activeId: null });
      }

      this.columns.value = newColumns;
      if (!isFolder) this.activeTileId.value = id;
      return;
    }


    if (isFolder) {
      const newColumns = cols.slice(0, colIndex + 1);
      const activeCol = newColumns[colIndex];
      if (activeCol) {
        newColumns[colIndex] = { ...activeCol, activeId: id };
      }

      // Add children
      const children = this.getChildren(`${id}/`);
      if (children.length > 0) {
        newColumns.push({ items: children, activeId: null });
      }
      this.columns.value = newColumns;
    } else {
      const newColumns = cols.slice(0, colIndex + 1);
      const activeCol = newColumns[colIndex];
      if (activeCol) {
        newColumns[colIndex] = { ...activeCol, activeId: id };
      }
      this.columns.value = newColumns;
      // Also set Focus
      this.activeTileId.value = id;
    }
  }

  setView(mode: ViewMode) {
    this.view.value = mode;
    // Reset specific states?
    if (mode !== 'FILES') {
      // maintain context?
    }
  }

  setFocus(tileId: string | null) {
    if (this.activeTileId.value !== tileId) {
      this.activeTileId.value = tileId;
      // Reset internal view mode when switching focus
      this.focusViewMode.value = 'CODE';
    }
  }

  toggleZenMode() {
    this.zenMode.value = !this.zenMode.value;
  }

  toggleExpanded(tileId: string) {
    // Create new Set for reactivity
    const current = new Set(this.expandedTiles.value);
    if (current.has(tileId)) {
      current.delete(tileId);
    } else {
      current.add(tileId);
    }
    this.expandedTiles.value = current;
  }
}

export const layoutStore = new LayoutStore();
