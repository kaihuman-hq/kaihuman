import { z } from 'zod';

export const TodoSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  completed: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  due: z.string().datetime().optional(),
  created_at: z.string().datetime(),
});

export const HabitSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  frequency: z.enum(['daily', 'weekly']),
  streaks: z.number().default(0),
  history: z.record(z.string(), z.boolean()).default({}), // ISO date -> completed
});

export const TimetrackingSchema = z.object({
  id: z.string().uuid(),
  project: z.string().min(1),
  duration: z.number().min(0), // in seconds
  timestamp: z.string().datetime(),
});

export const ConfigSchema = z.object({
  theme: z.enum(['nexus', 'light', 'dark']).default('nexus'),
  username: z.string().optional(),
});

export type Todo = z.infer<typeof TodoSchema>;
export type Habit = z.infer<typeof HabitSchema>;
export type Timetracking = z.infer<typeof TimetrackingSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// UI/Layout Data Types
export interface TileDef {
  id: string | number;
  title: string;
  rawContent?: string;
  extension?: string;
  type?: 'FILE' | 'FOLDER';
  onContentChange?: (newContent: string) => void;
  // UI specific props omitted in core, handled by UI extensions
}

export interface Column {
  items: TileDef[];
  activeId: string | null;
}

// Dashboard Configuration Types
export interface DashboardWorkspace {
  id: string;
  name: string;
}

export interface DashboardEntry {
  path: string;
  dashboard: string;
  skipOnMobile?: boolean; // Default false
}

export interface DashboardFilesConfig {
  selected?: string; // Currently selected file path
  opened?: string[]; // List of opened file paths
  recentlyOpened?: string[]; // MRU list
  quickNotes?: string[]; // Files available for quick notes in the extension
}

// Identifiers for the items that can appear in the desktop bottom navbar.
// Each maps to a navigation destination available from the magic menu.
export type NavItemId =
  | 'dashboard'
  | 'files'
  | 'board'
  | 'shortcuts'
  | 'wiki'
  | 'knowledge'
  | 'actionLog'
  | 'ideas'
  | 'business'
  | 'graph'
  | 'commits';

export interface DashboardConfig {
  version: number;
  dashboards: DashboardWorkspace[];
  entries: DashboardEntry[];
  theme?: 'nexus' | 'light' | 'amethyst'; // Default 'nexus'
  files: DashboardFilesConfig;
  /** Ordered list of items shown in the desktop bottom navbar. Defaults to Dashboard, Files, Board, Shortcuts. */
  navbar?: NavItemId[];
}
