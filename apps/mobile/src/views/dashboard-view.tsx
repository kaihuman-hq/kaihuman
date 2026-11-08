import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon, type IconName, Text } from '../ui/index.js';

export type { TileFile } from '../screens/dashboards.js';

export const DASHBOARD_LINKS = [
  ['Quick todo', '/quick-todo'],
  ['Board', '/board'],
  ['Analytics', '/analytics'],
  ['Ideas', '/ideas'],
  ['Wiki', '/wiki'],
  ['Knowledge', '/knowledge'],
  ['Files', '/files'],
  ['Repos', '/repos'],
] as const;

const LINK_ICONS: Record<(typeof DASHBOARD_LINKS)[number][0], IconName> = {
  'Quick todo': 'add',
  Board: 'board',
  Analytics: 'analytics',
  Ideas: 'ideas',
  Wiki: 'wiki',
  Knowledge: 'knowledge',
  Files: 'files',
  Repos: 'repos',
};

export function Shortcuts({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { colors, spacing, shape, metrics, platform } = useTheme();
  const { fontScale } = useWindowDimensions();
  const ios = platform === 'ios';
  // At large text sizes four columns would clip labels, so fall back to two.
  const basis = fontScale > 1.3 ? '47%' : '22%';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {DASHBOARD_LINKS.map(([label, href]) => {
        const primary = href === '/quick-todo';
        return (
          <Pressable
            key={href}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={`nav-${href}`}
            onPress={() => onNavigate(href)}
            android_ripple={ios ? undefined : { color: colors.pressed }}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: basis,
              minHeight: Math.max(metrics.hitTarget, 72),
              borderRadius: shape.lg,
              backgroundColor: primary ? colors.accentFill : colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              padding: spacing.sm,
              overflow: 'hidden',
              opacity: pressed && ios ? 0.7 : 1,
            })}
          >
            <Icon
              name={LINK_ICONS[label]}
              size={22}
              color={primary ? colors.onAccentFill : colors.accent}
            />
            <Text
              variant="caption1"
              weight="600"
              align="center"
              color={primary ? colors.onAccentFill : colors.label}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Skeleton() {
  const { colors, spacing, shape } = useTheme();
  const bar = (width: `${number}%`, height = 14) => (
    <View style={{ width, height, borderRadius: 7, backgroundColor: colors.fill }} />
  );
  return (
    <View accessible accessibilityLabel="Loading tiles" accessibilityState={{ busy: true }}>
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.surface,
            borderRadius: shape.lg,
            padding: spacing.lg,
            gap: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: shape.sm,
                backgroundColor: colors.fill,
              }}
            />
            {bar('40%', 18)}
          </View>
          {bar('90%')}
          {bar('70%')}
          {bar('80%')}
        </View>
      ))}
      <ActivityIndicator color={colors.secondaryLabel} />
    </View>
  );
}
