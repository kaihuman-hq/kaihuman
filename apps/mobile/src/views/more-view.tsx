import { View } from 'react-native';
import { type Theme, useTheme } from '../theme/theme.js';
import type { IconName } from '../ui/index.js';
import { ListRow, Screen, Section, Text } from '../ui/index.js';

interface WorkspaceLink {
  href: string;
  title: string;
  subtitle: string;
  icon: IconName;
  tile: (c: Theme['colors']) => string;
}

// Tile fills come from the palette so they follow light and dark; no off-palette hues.
const WORKSPACE: readonly WorkspaceLink[] = [
  {
    href: '/analytics',
    title: 'Analytics',
    subtitle: 'Todo velocity and totals',
    icon: 'analytics',
    tile: (c) => c.warning,
  },
  {
    href: '/wiki',
    title: 'Wiki',
    subtitle: 'Pages and backlinks',
    icon: 'wiki',
    tile: (c) => c.info,
  },
  {
    href: '/knowledge',
    title: 'Knowledge',
    subtitle: 'Inbox and topics',
    icon: 'knowledge',
    tile: (c) => c.success,
  },
  {
    href: '/files',
    title: 'Files',
    subtitle: 'Browse and edit the repository',
    icon: 'files',
    tile: (c) => c.accentFill,
  },
  {
    href: '/repos',
    title: 'Repositories',
    subtitle: 'Choose the knowledge base',
    icon: 'repos',
    tile: (c) => c.secondaryLabel,
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
  const ios = theme.platform === 'ios';
  // Glyphs on a coloured tile must contrast with it in both schemes.
  const glyph = theme.scheme === 'dark' ? colors.background : colors.surface;

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
            iconBackground={l.tile(colors)}
            iconColor={ios ? (l.icon === 'files' ? colors.onAccentFill : glyph) : undefined}
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
          iconBackground={colors.danger}
          iconColor={ios ? glyph : undefined}
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
