import type { NavActiveTab, NavItemId } from '@kaihuman/core';
import {
  Archive,
  BookOpen,
  Briefcase,
  GitCommit,
  Keyboard,
  LayoutGrid,
  Library,
  Lightbulb,
  Network,
  Rows3,
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
  { id: 'board', label: 'Stream', icon: Rows3 },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
  { id: 'knowledge', label: 'Knowledge Base', icon: Library },
  { id: 'actionLog', label: 'Action Log', icon: ScrollText },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'business', label: 'Business', icon: Briefcase },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'commits', label: 'Commits', icon: GitCommit },
];

/** Items shown when the user has not customised the navbar. */
export const DEFAULT_NAVBAR: NavItemId[] = ['dashboard', 'files', 'board', 'ideas', 'shortcuts'];

/** Business joins the default navbar only once it is set up; a customised navbar is never touched. */
export const defaultNavbar = (businessEnabled: boolean): NavItemId[] =>
  businessEnabled ? [...DEFAULT_NAVBAR, 'business'] : DEFAULT_NAVBAR;

export const getNavbarItem = (id: NavItemId): NavbarItemDef | undefined =>
  NAVBAR_ITEMS.find((item) => item.id === id);

// The 'board' tab leads to the stream view; the kanban board is one toggle away from it.
const STREAM_PATHS = new Set(['/stream', '/streams', '/board']);

export const activeTabForPath = (path: string): NavActiveTab =>
  STREAM_PATHS.has(path) ? 'BOARD' : 'HOME';
