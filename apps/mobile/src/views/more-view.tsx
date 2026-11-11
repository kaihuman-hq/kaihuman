import { View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import type { IconName, IconTone } from '../ui/index.js';
import { ListRow, Screen, Section, Text } from '../ui/index.js';

interface WorkspaceLink {
  href: string;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: IconTone;
}

// One tone per concept across screens: Knowledge green as in Capture, Wiki accent as its page
// rows, Files blue as its folders.
const WORKSPACE: readonly WorkspaceLink[] = [
  {
    href: '/analytics',
    title: 'Analytics',
    subtitle: 'Todo velocity and totals',
    icon: 'analytics',
    tone: 'warning',
  },
  {
    href: '/business',
    title: 'Business',
    subtitle: 'Clients, time, invoices',
    icon: 'wallet',
    tone: 'info',
  },
  {
    href: '/weekly-review',
    title: 'Weekly review',
    subtitle: 'Your week, written to logs/',
    icon: 'analytics',
    tone: 'accent',
  },
  {
    href: '/scan',
    title: 'Scan',
    subtitle: 'Receipt, ticket or meter to an entry',
    icon: 'capture',
    tone: 'success',
  },
  {
    href: '/wiki',
    title: 'Wiki',
    subtitle: 'Pages and backlinks',
    icon: 'wiki',
    tone: 'accent',
  },
  {
    href: '/knowledge',
    title: 'Knowledge',
    subtitle: 'Inbox and topics',
    icon: 'knowledge',
    tone: 'success',
  },
  {
    href: '/files',
    title: 'Files',
    subtitle: 'Browse and edit the repository',
    icon: 'files',
    tone: 'info',
  },
  {
    href: '/more/settings',
    title: 'Settings',
    subtitle: 'Command palette and notifications',
    icon: 'settings',
    tone: 'neutral',
  },
  {
    href: '/repos',
    title: 'Repositories',
    subtitle: 'Choose the knowledge base',
    icon: 'repos',
    tone: 'neutral',
  },
];

export interface MoreViewProps {
  onNavigate: (href: string) => void;
  onSignOut: () => void;
  version: string;
  /** Signed-in account shown in the header row. */
  account?: { name: string; login?: string };
  /** `owner/name` of the selected repository. */
  repo?: string;
}

/** Initials for the avatar disc: first letters of up to two words. */
const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export function MoreView({ onNavigate, onSignOut, version, account, repo }: MoreViewProps) {
  const theme = useTheme();
  const { spacing, colors } = theme;

  return (
    <Screen title="More">
      {account ? (
        <View
          testID="more-account"
          accessible
          accessibilityLabel={`Signed in as ${account.name}${repo ? `, repository ${repo}` : ''}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: theme.shape.lg,
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.accentFill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="title3" color={colors.onAccentFill}>
              {initials(account.name)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text variant="headline">{account.name}</Text>
            {account.login && account.login !== account.name ? (
              <Text variant="subheadline" tone="secondary">
                {`@${account.login}`}
              </Text>
            ) : null}
            {repo ? (
              <Text variant="footnote" tone="secondary" mono>
                {repo}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <Section header="Workspace">
        {WORKSPACE.map((l) => (
          <ListRow
            key={l.href}
            testID={`more-${l.title.toLowerCase()}`}
            title={l.title}
            subtitle={l.subtitle}
            icon={l.icon}
            iconTone={l.tone}
            accessory="chevron"
            onPress={() => onNavigate(l.href)}
          />
        ))}
      </Section>
      <Section>
        <ListRow
          testID="more-sign-out"
          title="Sign out"
          icon="signOut"
          iconTone="danger"
          destructive
          onPress={onSignOut}
        />
      </Section>
      <Text
        variant="footnote"
        tone="secondary"
        mono
        align="center"
        style={{ paddingTop: spacing.sm }}
      >
        kaihuman {version}
      </Text>
    </Screen>
  );
}
