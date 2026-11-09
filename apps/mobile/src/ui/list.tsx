import { Children, createContext, type ReactNode, useContext, useRef } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import SwipeableModule, {
  type SwipeableMethods,
  type SwipeableProps,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { type Palette, useTheme } from '../theme/theme.js';
import { haptics } from './haptics.js';
import { Icon, type IconName } from './icon.js';
import { useScreenInset } from './screen.js';
import { Text } from './text.js';

// NodeNext types this CJS-flagged subpath's default export as the module namespace; at runtime it
// is the component.
const ReanimatedSwipeable = SwipeableModule as unknown as (props: SwipeableProps) => ReactNode;

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
  /** Edge the button is revealed from when swiping; defaults to trailing. */
  side?: 'leading' | 'trailing';
  onPress: () => void;
}

const sideOf = (a: SwipeAction) => a.side ?? 'trailing';

/**
 * Buttons in reveal order, nearest the row first. The destructive action goes outermost
 * (HIG), which is the last button on the trailing edge and the first one on the leading edge.
 */
function revealOrder(actions: readonly SwipeAction[], side: 'leading' | 'trailing') {
  const mine = actions.filter((a) => sideOf(a) === side);
  const safe = mine.filter((a) => !a.destructive);
  const risky = mine.filter((a) => a.destructive);
  return side === 'trailing' ? [...safe, ...risky] : [...risky, ...safe];
}

const ACTION_WIDTH = 80;

function actionColors(c: Palette, action: SwipeAction, index: number, ios: boolean) {
  if (action.destructive) return { fill: c.danger, text: c.onDanger };
  if (action.color) return { fill: action.color, text: c.onStatus };
  // Material 3 uses tonal containers; iOS uses solid fills, one hue per extra action.
  if (!ios) return { fill: c.accentSoft, text: c.onAccentSoft };
  return index === 0
    ? { fill: c.accentFill, text: c.onAccentFill }
    : { fill: c.info, text: c.onStatus };
}

function SwipeButtons({
  actions,
  methods,
  onTrigger,
}: {
  actions: readonly SwipeAction[];
  methods: SwipeableMethods;
  onTrigger: (action: SwipeAction, methods: SwipeableMethods) => void;
}) {
  const theme = useTheme();
  const ios = theme.platform === 'ios';
  return (
    <View style={{ flexDirection: 'row' }}>
      {actions.map((action, index) => {
        const { fill, text } = actionColors(theme.colors, action, index, ios);
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            testID={`swipe-action-${action.label}`}
            onPress={() => onTrigger(action, methods)}
            style={{
              width: ACTION_WIDTH,
              backgroundColor: fill,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 4,
            }}
          >
            {action.icon ? (
              <Icon name={action.icon} size={22} color={text} weight="semibold" />
            ) : null}
            <Text
              variant="footnote"
              weight="600"
              numberOfLines={2}
              style={{ color: text, textAlign: 'center' }}
            >
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Category colour of a row's leading icon; one mapping so every screen's tiles match. */
export type IconTone = 'accent' | 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function toneColors(c: Palette, tone: IconTone): { fill: string; glyph: string } {
  if (tone === 'accent') return { fill: c.accentFill, glyph: c.onAccentFill };
  const fill = tone === 'neutral' ? c.secondaryLabel : c[tone];
  return { fill, glyph: tone === 'danger' ? c.onDanger : c.onStatus };
}

/** Swipe-to-reveal wrapper for rows that are not a `ListRow`; native only, pass the row as children. */
export function SwipeReveal({
  actions,
  testID,
  children,
}: {
  actions: readonly SwipeAction[];
  testID?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const ios = theme.platform === 'ios';
  const ref = useRef<SwipeableMethods>(null);
  const leading = revealOrder(actions, 'leading');
  const trailing = revealOrder(actions, 'trailing');
  const trigger = (action: SwipeAction, methods: SwipeableMethods) => {
    methods.close();
    if (action.destructive) haptics.warning();
    else haptics.success();
    action.onPress();
  };
  return (
    <ReanimatedSwipeable
      ref={ref}
      testID={testID}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.selection()}
      renderLeftActions={
        leading.length
          ? (_p, _t, methods) => (
              <SwipeButtons actions={leading} methods={methods} onTrigger={trigger} />
            )
          : undefined
      }
      renderRightActions={
        trailing.length
          ? (_p, _t, methods) => (
              <SwipeButtons actions={trailing} methods={methods} onTrigger={trigger} />
            )
          : undefined
      }
      childrenContainerStyle={{
        backgroundColor: ios ? theme.colors.surface : theme.colors.background,
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
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
 * Long-press menu (ActionSheet on iOS, Alert elsewhere). The swipe reveal is a pan gesture
 * that switch and screen-reader users cannot perform, so this stays as the fallback.
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

  const swipeRef = useRef<SwipeableMethods>(null);
  // react-native-web has no usable native swipe; there the long-press menu is the way in.
  const swipeable = hasActions && !disabled && Platform.OS !== 'web';
  const leading = revealOrder(swipeActions ?? [], 'leading');
  const trailing = revealOrder(swipeActions ?? [], 'trailing');

  const trigger = (action: SwipeAction, methods?: SwipeableMethods) => {
    (methods ?? swipeRef.current)?.close();
    if (action.destructive) haptics.warning();
    else haptics.success();
    action.onPress();
  };

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

  const actionList = swipeActions ?? [];
  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityHint={hasActions && !onLongPress ? 'Long press for more actions' : undefined}
      accessibilityActions={
        hasActions ? actionList.map((a, i) => ({ name: `swipe-${i}`, label: a.label })) : undefined
      }
      onAccessibilityAction={(event) => {
        const action = actionList[Number(event.nativeEvent.actionName.replace('swipe-', ''))];
        if (action) trigger(action);
      }}
      onPress={onPress}
      onLongPress={onLongPress || hasActions ? handleLongPress : undefined}
      testID={testID}
      android_ripple={ios ? undefined : { color: colors.pressed }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
  if (!swipeable) return pressable;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      testID={testID ? `${testID}-swipeable` : undefined}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.selection()}
      renderLeftActions={
        leading.length
          ? (_progress, _translation, methods) => (
              <SwipeButtons actions={leading} methods={methods} onTrigger={trigger} />
            )
          : undefined
      }
      renderRightActions={
        trailing.length
          ? (_progress, _translation, methods) => (
              <SwipeButtons actions={trailing} methods={methods} onTrigger={trigger} />
            )
          : undefined
      }
      // Opaque so the buttons stay hidden until the row slides away.
      childrenContainerStyle={{ backgroundColor: ios ? colors.surface : colors.background }}
    >
      {pressable}
    </ReanimatedSwipeable>
  );
}
