import type { SyncNowResult } from '../sync/hooks.js';
import type { IconName, IconTone } from '../ui/index.js';
import { ListRow, Screen, Section } from '../ui/index.js';

interface SettingsLink {
  href: string;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: IconTone;
  testID: string;
}

const LINKS: readonly SettingsLink[] = [
  {
    href: '/more/palette',
    title: 'Command palette',
    subtitle: 'Search engines, assistants and tools',
    icon: 'terminal',
    tone: 'accent',
    testID: 'settings-palette',
  },
  {
    href: '/more/notifications',
    title: 'Notifications',
    subtitle: 'Reminders for due todos and milestones',
    icon: 'clock',
    tone: 'danger',
    testID: 'settings-notifications',
  },
];

export interface SyncNowState {
  running: boolean;
  result: SyncNowResult | null;
  syncNow: () => void;
}

function syncSubtitle({ running, result }: SyncNowState): string {
  if (running) return 'Syncing…';
  if (!result) return 'Pull the latest from GitHub and push pending edits';
  return result.ok ? 'Synced just now' : `Sync failed: ${result.error}`;
}

export function SettingsView({
  onNavigate,
  sync,
}: {
  onNavigate: (href: string) => void;
  sync: SyncNowState;
}) {
  return (
    <Screen title="Settings">
      <Section>
        <ListRow
          testID="settings-sync-now"
          title="Sync now"
          subtitle={syncSubtitle(sync)}
          icon="refresh"
          iconTone="success"
          disabled={sync.running}
          onPress={sync.syncNow}
        />
      </Section>
      <Section>
        {LINKS.map((l) => (
          <ListRow
            key={l.href}
            testID={l.testID}
            title={l.title}
            subtitle={l.subtitle}
            icon={l.icon}
            iconTone={l.tone}
            accessory="chevron"
            onPress={() => onNavigate(l.href)}
          />
        ))}
      </Section>
    </Screen>
  );
}
