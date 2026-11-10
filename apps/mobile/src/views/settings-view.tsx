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

export function SettingsView({ onNavigate }: { onNavigate: (href: string) => void }) {
  return (
    <Screen title="Settings">
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
