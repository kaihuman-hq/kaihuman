
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
}

export interface DashboardConfig {
  version: number;
  dashboards: DashboardWorkspace[];
  entries: DashboardEntry[];
  files: DashboardFilesConfig;
}
