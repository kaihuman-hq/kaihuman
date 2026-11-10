import { Link } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { TileResult } from '../../../components/widgets/tile-controllers.js';
import { useTheme } from '../../../theme/theme.js';
import { haptics, Icon, Text } from '../../../ui/index.js';
import type { Glance, QuickAction } from '../glance/types.js';
import { MiniViz, VIZ_HEIGHT } from './mini-viz.js';
import { tintColors, toneColor } from './tone.js';

/** README decision 1: 2 columns, 13 pt gutters (174 pt tiles on a 393 pt screen). */
export const TILE_GAP = 13;
export const tileSide = (screenWidth: number, margin: number): number =>
  Math.floor((screenWidth - margin * 2 - TILE_GAP) / 2);

const PAD = 14;

export const quickEntryRoute = (path: string) => `/quick-entry?path=${encodeURIComponent(path)}`;

export interface SquareTileProps {
  path: string;
  glance: Glance;
  content: string;
  size: number;
  /** Deep-dive route; iOS opens it with the zoom transition. */
  href: string;
  onNavigate: (href: string) => void;
  onWrite: (path: string, content: string) => void | Promise<void>;
  /** Reserved for dashboard edit mode (long-press a tile). */
  onLongPress?: () => void;
}

const resultOf = (r: string | TileResult): TileResult =>
  typeof r === 'string' ? { ok: true, content: r } : r;

function QuickButton({
  action,
  title,
  onPress,
}: {
  action: QuickAction;
  title: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const stop = action.icon === 'stop';
  const done = action.kind === 'tap' && action.done === true;
  // An unticked check waits in a neutral ring; ticked, it fills like the ＋ buttons.
  const muted = stop || (action.icon === 'check' && !done);
  const bg = muted ? colors.fill : colors.accentFill;
  const fg = muted ? colors.label : colors.onAccentFill;
  return (
    <Pressable
      testID="tile-quick-action"
      accessibilityRole="button"
      accessibilityLabel={action.label || `Add to ${title}`}
      accessibilityState={{ checked: action.kind === 'tap' ? done : undefined }}
      hitSlop={8}
      onPress={onPress}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
      }}
    >
      <Icon name={action.icon} size={stop ? 11 : 15} color={fg} weight="bold" />
    </Pressable>
  );
}

function Hero({ glance }: { glance: Glance }) {
  const theme = useTheme();
  const { colors } = theme;
  if (glance.counts) {
    return (
      <View testID="tile-counts" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
        {glance.counts.map((c, i) => (
          <View
            key={c.label}
            style={
              i === (glance.counts?.length ?? 0) - 1
                ? { marginLeft: 'auto', alignItems: 'flex-end' }
                : undefined
            }
          >
            <Text
              mono
              style={{
                fontSize: i === 2 ? 24 : 34,
                lineHeight: 38,
                fontWeight: '600',
                color: toneColor(theme, c.tone),
              }}
            >
              {c.value}
            </Text>
            <Text variant="footnote" tone="secondary">
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View>
      {glance.eyebrow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {glance.live ? (
            <View
              testID="tile-live-dot"
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }}
            />
          ) : null}
          <Text variant="caption1" weight="600" numberOfLines={1}>
            {glance.eyebrow}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text
          testID="tile-hero"
          mono
          numberOfLines={1}
          style={{
            fontSize: 34,
            lineHeight: 40,
            fontWeight: '600',
            letterSpacing: -1,
            flexShrink: 1,
            color: glance.heroTone ? toneColor(theme, glance.heroTone) : colors.label,
          }}
        >
          {glance.hero}
        </Text>
        {glance.unit ? (
          <Text variant="subheadline" tone="secondary" mono numberOfLines={1}>
            {glance.unit}
          </Text>
        ) : null}
      </View>
      {glance.label || glance.delta ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {glance.delta ? (
            <Text variant="footnote" color={toneColor(theme, glance.delta.tone)}>
              {glance.delta.text}
              {glance.label ? ' · ' : ''}
            </Text>
          ) : null}
          {glance.label}
        </Text>
      ) : null}
    </View>
  );
}

/** iOS 18 zooms the tile into its detail screen; elsewhere a plain press navigates. */
function TileLink({
  href,
  onOpen,
  onLongPress,
  label,
  children,
}: {
  href: string;
  onOpen: () => void;
  onLongPress?: () => void;
  label: string;
  children: ReactNode;
}) {
  const pressable = (onPress?: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => haptics.light()}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
  if (Platform.OS === 'ios') {
    return (
      <Link href={href as never} asChild>
        <Link.Trigger>
          <Link.AppleZoom>{pressable()}</Link.AppleZoom>
        </Link.Trigger>
      </Link>
    );
  }
  return pressable(onOpen);
}

/** One square dashboard tile (README "Tile anatomy"): header · space · hero · label · tiny visual. */
export function SquareTile({
  path,
  glance,
  content,
  size,
  href,
  onNavigate,
  onWrite,
  onLongPress,
}: SquareTileProps) {
  const theme = useTheme();
  const { colors, scheme, platform } = theme;
  const tint = tintColors(theme, glance.tint);
  const [error, setError] = useState<string | null>(null);

  const runAction = (action: QuickAction) => {
    if (action.kind === 'open') return onNavigate(action.href);
    if (action.kind === 'field') return onNavigate(quickEntryRoute(path));
    const result = resultOf(action.run(content, new Date()));
    if (!result.ok) {
      setError(result.error);
      haptics.error();
      return;
    }
    setError(null);
    haptics.success();
    void onWrite(path, result.content);
  };

  const shadow =
    platform === 'ios' && scheme === 'light'
      ? {
          shadowColor: colors.shadow,
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 1 },
        }
      : null;

  return (
    <View
      testID={`square-${path}`}
      style={{
        width: size,
        height: size,
        borderRadius: 24,
        backgroundColor: colors.surface,
        ...shadow,
      }}
    >
      <TileLink
        href={href}
        onOpen={() => onNavigate(href)}
        {...(onLongPress && { onLongPress })}
        label={`${glance.title}, ${glance.counts ? glance.counts.map((c) => `${c.value} ${c.label}`).join(', ') : `${glance.hero} ${glance.unit ?? ''} ${glance.label}`.trim()}`}
      >
        <View
          testID={`glance-${glance.title}`}
          style={{ flex: 1, padding: PAD, borderRadius: 24, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tint.bg,
              }}
            >
              <Icon name={glance.icon} size={14} color={tint.fg} />
            </View>
            <Text variant="subheadline" weight="600" numberOfLines={1} style={{ flex: 1 }}>
              {glance.title}
            </Text>
            {glance.action ? (
              <QuickButton
                action={glance.action}
                title={glance.title}
                onPress={() => runAction(glance.action as QuickAction)}
              />
            ) : null}
          </View>
          <View style={{ flex: 1 }} />
          <Hero glance={glance} />
          {error ? (
            <Text variant="caption2" color={colors.danger} numberOfLines={1}>
              {error}
            </Text>
          ) : null}
          {glance.viz ? (
            <View
              style={{
                marginTop: 8,
                minHeight: glance.viz.kind === 'text' ? 0 : undefined,
                maxHeight: VIZ_HEIGHT + 12,
              }}
            >
              <MiniViz viz={glance.viz} width={size - PAD * 2} />
            </View>
          ) : null}
        </View>
      </TileLink>
    </View>
  );
}
