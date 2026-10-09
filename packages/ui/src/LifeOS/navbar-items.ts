import type { NavItemId } from '@kaihuman/core';
import {
  Archive,
  BookOpen,
  GitCommit,
  Kanban,
  Keyboard,
  LayoutGrid,
  Library,
  Network,
  ScrollText,
} from 'lucide-preact';

export interface NavbarItemDef {
  id: NavItemId;
  label: string;
  icon: any;
}

/** Catalog of every destination that can be placed in the desktop bottom navbar. */
export const NAVBAR_ITEMS: NavbarItemDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'files', label: 'Files', icon: Archive },
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
  { id: 'knowledge', label: 'Knowledge Base', icon: Library },
  { id: 'actionLog', label: 'Action Log', icon: ScrollText },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'commits', label: 'Commits', icon: GitCommit },
];

/** Items shown when the user has not customised the navbar. Matches the historical default. */
export const DEFAULT_NAVBAR: NavItemId[] = ['dashboard', 'files', 'board', 'shortcuts'];

export const getNavbarItem = (id: NavItemId): NavbarItemDef | undefined =>
  NAVBAR_ITEMS.find((item) => item.id === id);
