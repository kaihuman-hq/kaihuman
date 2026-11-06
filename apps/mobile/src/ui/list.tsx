import { Children, createContext, type ReactNode, useContext } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { type Palette, useTheme } from '../theme/theme.js';
import { Icon, type IconName } from './icon.js';
import { useScreenInset } from './screen.js';
import { Text } from './text.js';

const ICON_TILE = 29;
const ICON_GAP = 12;

/** Whether a row is the last in its section (it then draws no separator). */
const RowPosition = createContext<{ last: boolean }>({ last: true });

export interface SectionProps {
  header?: string;
  footer?: string;
  children?: ReactNode;
}

export function Section({ header, footer, children }: SectionProps) {
  const theme = useTheme();
  const { colors, spacing, shape, metrics } = theme;
  const ios = theme.platform === 'ios';
  const grouped = useScreenInset() === 'grouped';
  const rows = Children.toArray(children);
  // iOS cards inset themselves unless the screen already does; Android rows run edge to edge,
  // so they cancel the screen margin to keep ripples full-bleed.
  const horizontal = ios
    ? grouped
      ? 0
      : metrics.screenMargin
    : grouped
      ? -metrics.screenMargin
      : 0;

  return (
    <View style={{ marginHorizontal: horizontal, marginBottom: spacing.sm }}>
      {header ? (
        <Text
          variant={ios ? 'footnote' : 'subheadline'}
          weight={ios ? '400' : '500'}
          tone={ios ? 'secondary' : 'accent'}
          accessibilityRole="header"
          style={{
            textTransform: ios ? 'uppercase' : 'none',
            paddingHorizontal: ios ? spacing.lg : metrics.screenMargin,
            paddingBottom: spacing.xs + 2,
            paddingTop: spacing.sm,
          }}
        >
          {header}
        </Text>
      ) : null}
      <View
        style={
          ios
            ? { backgroundColor: colors.surface, borderRadius: shape.md, overflow: 'hidden' }
            : undefined
        }
      >
        {rows.map((child, index) => (
          <RowPosition.Provider
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            key={index}
            value={{ last: index === rows.length - 1 }}
          >
            {child}
          </RowPosition.Provider>
        ))}
      </View>
      {footer ? (
        <Text
          variant="footnote"
          tone="secondary"
          style={{
            paddingHorizontal: ios ? spacing.lg : metrics.screenMargin,
            paddingTop: spacing.xs + 2,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface SwipeAction {
  label: string;
  icon?: IconName;
  color?: string;
  /** Marked red in the iOS action sheet. */
  destructive?: boolean;
  onPress: () => void;
}

/** Category colour of a row's leading icon; one mapping so every screen's tiles match. */
export type IconTone = 'accent' | 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function toneColors(c: Palette, tone: IconTone): { fill: string; glyph: string } {
  if (tone === 'accent') return { fill: c.accentFill, glyph: c.onAccentFill };
  const fill = tone === 'neutral' ? c.secondaryLabel : c[tone];
  return { fill, glyph: tone === 'danger' ? c.onDanger : c.onStatus };
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  /** iOS: coloured tile behind the glyph. Android: tinted glyph. Overrides the two below. */
  iconTone?: IconTone;
  /** iOS: tile fill. Android: ignored (glyph stays neutral). */
  iconBackground?: string;
  /** Glyph colour; defaults to white on a custom tile, accent-on-fill otherwise. */
  iconColor?: string;
  accessory?: 'chevron' | 'check' | 'none' | ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
  swipeActions?: readonly SwipeAction[];
}

/**
 * Swipe actions are surfaced as a long-press menu (ActionSheet on iOS, Alert elsewhere)
 * rather than a pan-gesture reveal: it needs no gesture-handler dependency and is
 * reachable by assistive tech. The trade-off is lower discoverability than a swipe.
 */
function showActions(title: string, actions: readonly SwipeAction[], ios: boolean) {
  if (ios && Platform.OS === 'ios') {
    const options = [...actions.map((a) => a.label), 'Cancel'];
    const destructiveIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...actions.map((a) => ({ text: a.label, onPress: a.onPress })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconTone,
  iconBackground: tileFill,
  iconColor: tileGlyph,
  accessory = 'none',
  onPress,
  onLongPress,
  destructive,
  disabled,
  testID,
  swipeActions,
}: ListRowProps) {
  const theme = useTheme();
  const { colors, spacing, metrics } = theme;
  const ios = theme.platform === 'ios';
  const { last } = useContext(RowPosition);
  const tone = iconTone ? toneColors(colors, iconTone) : undefined;
  const iconBackground = tone ? tone.fill : tileFill;
  const iconColor = tone
    ? ios
      ? tone.glyph
      : iconTone === 'accent'
        ? colors.accent
        : iconTone === 'neutral'
          ? colors.secondaryLabel
          : tone.fill
    : tileGlyph;
  const hasActions = (swipeActions?.length ?? 0) > 0;
  const interactive = Boolean(onPress || onLongPress || hasActions) && !disabled;

  const handleLongPress = () => {
    if (onLongPress) onLongPress();
    else if (swipeActions && hasActions) showActions(title, swipeActions, ios);
  };

  const iconNode = icon ? (
    ios ? (
      <View
        style={{
          width: ICON_TILE,
          height: ICON_TILE,
          borderRadius: 7,
          backgroundColor: iconBackground ?? colors.accentFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={icon}
          size={17}
          color={iconColor ?? (iconBackground ? colors.onStatus : colors.onAccentFill)}
        />
      </View>
    ) : (
      <Icon
        name={icon}
        size={24}
        color={destructive ? colors.danger : (iconColor ?? colors.secondaryLabel)}
      />
    )
  ) : null;

  const accessoryNode =
    accessory === 'none' ? null : accessory === 'chevron' ? (
      <Icon name="chevronRight" size={14} color={colors.tertiaryLabel} weight="semibold" />
    ) : accessory === 'check' ? (
      <Icon name="check" size={18} color={colors.accent} weight="semibold" />
    ) : (
      accessory
    );

  const leadingWidth = icon ? (ios ? ICON_TILE : 24) + ICON_GAP : 0;
  const separatorLeft = ios
    ? metrics.separatorInset + (icon ? ICON_TILE + ICON_GAP : 0)
    : metrics.screenMargin + leadingWidth;

  const body = (pressed: boolean) => (
    <View
      style={{
        minHeight: metrics.rowHeight,
        paddingLeft: metrics.screenMargin,
        backgroundColor: pressed && ios ? colors.pressed : 'transparent',
        opacity: disabled ? 0.4 : 1,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: ICON_GAP,
          paddingVertical: subtitle ? spacing.sm + 2 : spacing.sm,
          paddingRight: metrics.screenMargin,
          minHeight: metrics.rowHeight,
        }}
      >
        {iconNode}
        <View style={{ flex: 1 }}>
          <Text tone={destructive ? 'danger' : 'primary'} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant={ios ? 'footnote' : 'subheadline'} tone="secondary" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant={ios ? 'body' : 'subheadline'} tone="secondary" numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {accessoryNode}
      </View>
      {ios && !last ? (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: separatorLeft,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.separator,
          }}
        />
      ) : null}
    </View>
  );

  if (!interactive) {
    return (
      <View
        testID={testID}
        accessible={Boolean(value)}
        accessibilityLabel={value ? `${title}, ${value}` : undefined}
      >
        {body(false)}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={hasActions && !onLongPress ? 'Long press for more actions' : undefined}
      onPress={onPress}
      onLongPress={onLongPress || hasActions ? handleLongPress : undefined}
      testID={testID}
      android_ripple={ios ? undefined : { color: colors.pressed }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}
