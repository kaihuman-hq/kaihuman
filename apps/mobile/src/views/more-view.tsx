import { useTheme } from '../theme/theme.js';
import type { IconName } from '../ui/index.js';
import { ListRow, Screen, Section, Text } from '../ui/index.js';

interface WorkspaceLink {
  href: string;
  title: string;
  icon: IconName;
  tile: string;
}

const WORKSPACE: readonly WorkspaceLink[] = [
  { href: '/analytics', title: 'Analytics', icon: 'analytics', tile: '#FF9F0A' },
  { href: '/wiki', title: 'Wiki', icon: 'wiki', tile: '#5E5CE6' },
  { href: '/knowledge', title: 'Knowledge', icon: 'knowledge', tile: '#30B0C7' },
  { href: '/files', title: 'Files', icon: 'files', tile: '#0A84FF' },
  { href: '/repos', title: 'Repositories', icon: 'repos', tile: '#8E8E93' },
];

export interface MoreViewProps {
  onNavigate: (href: string) => void;
  onSignOut: () => void;
  version: string;
}

export function MoreView({ onNavigate, onSignOut, version }: MoreViewProps) {
  const { spacing } = useTheme();
  return (
    <Screen title="More">
      <Section header="Workspace">
        {WORKSPACE.map((l) => (
          <ListRow
            key={l.href}
            testID={`more-${l.title.toLowerCase()}`}
            title={l.title}
            icon={l.icon}
            iconBackground={l.tile}
            accessory="chevron"
            onPress={() => onNavigate(l.href)}
          />
        ))}
      </Section>
      <Section header="Account">
        <ListRow
          testID="more-sign-out"
          title="Sign out"
          icon="signOut"
          iconBackground="#FF453A"
          destructive
          onPress={onSignOut}
        />
      </Section>
      <Text
        variant="footnote"
        tone="secondary"
        style={{ textAlign: 'center', paddingTop: spacing.sm }}
      >
        kaihuman {version}
      </Text>
    </Screen>
  );
}
