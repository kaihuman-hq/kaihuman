import { signal } from '@preact/signals';

export type NavActiveTab = 'HOME' | 'BOARD' | 'SEARCH' | 'MORE';
export type NavSheetMode = 'MENU' | 'REPOS' | 'WORKSPACES';

export class NavigationStore {
  // Mobile More sheet
  moreSheetOpen = signal<boolean>(false);
  sheetMode = signal<NavSheetMode>('MENU');

  // Mobile FAB creation stack
  fabStackOpen = signal<boolean>(false);

  // Mobile tab bar
  activeTab = signal<NavActiveTab>('HOME');

  // Desktop overflow drawer
  desktopDrawerOpen = signal<boolean>(false);
  desktopDrawerMode = signal<NavSheetMode>('MENU');
}

export const navigationStore = new NavigationStore();
