import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BackHandler, PanResponder, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { QuickMenuAction } from '../screens/quick-menu.js';
import { useTheme } from '../theme/theme.js';
import { Icon, Text } from '../ui/index.js';
import { tintColors } from './tiles/square/tone.js';

/** Docs/redesign "Animation notes": scrim to 42 % in 180 ms, sheet spring damping 18, items 20 ms apart. */
const SCRIM_OPACITY = 0.42;
const SCRIM_MS = 180;
const SHEET_SPRING = { damping: 18, stiffness: 220 };
const STAGGER_MS = 20;
/** Far enough to hide any sheet; the real height is not known before layout. */
const OFFSCREEN = 800;
const DISMISS_DRAG = 120;

export interface QuickMenuProps {
  open: boolean;
  capture: readonly QuickMenuAction[];
  track: readonly QuickMenuAction[];
  /** Bottom row: the last action and its "used N× today" caption. */
  last: { action: QuickMenuAction; caption: string } | null;
  onRun: (action: QuickMenuAction) => void;
  onClose: () => void;
  /** Space kept free at the bottom so the tab bar (and its ×) stays visible and tappable. */
  bottomOffset: number;
}

/**
 * The ＋ quick menu: Capture (quick-* sheets) and Track (one-tap entries from the user's tiles).
 * An overlay above the tab bar rather than a Modal, so the rotated ＋ stays on top as the close control.
 */
export function QuickMenu(props: QuickMenuProps) {
  const { open, onClose } = props;
  // Stays mounted through the exit animation.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  return mounted ? <QuickMenuSheet {...props} onHidden={() => setMounted(false)} /> : null;
}

function QuickMenuSheet({
  open,
  capture,
  track,
  last,
  onRun,
  onClose,
  bottomOffset,
  onHidden,
}: QuickMenuProps & { onHidden: () => void }) {
  const { colors, spacing, shape } = useTheme();
  const scrim = useSharedValue(0);
  const offset = useSharedValue(OFFSCREEN);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (open) {
      drag.set(0);
      scrim.set(withTiming(SCRIM_OPACITY, { duration: SCRIM_MS }));
      offset.set(withSpring(0, SHEET_SPRING));
      return;
    }
    scrim.set(withTiming(0, { duration: SCRIM_MS }));
    offset.set(
      withTiming(OFFSCREEN, { duration: 220 }, (finished?: boolean) => {
        if (finished) scheduleOnRN(onHidden);
      }),
    );
  }, [open, scrim, offset, drag, onHidden]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Drag down on the sheet closes it past a distance or on a fast flick.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => drag.set(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > 1) onCloseRef.current();
        else drag.set(withSpring(0, SHEET_SPRING));
      },
    }),
  ).current;

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() + drag.get() }],
  }));

  let index = 0;
  const item = (a: QuickMenuAction) => (
    <QuickItem key={a.id} action={a} index={index++} open={open} onRun={onRun} />
  );

  return (
    <View
      testID="quick-menu"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: bottomOffset }}
    >
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
          scrimStyle,
        ]}
      >
        <Pressable
          testID="quick-menu-scrim"
          accessibilityLabel="Close quick menu"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityViewIsModal
        style={[
          {
            position: 'absolute',
            left: spacing.sm,
            right: spacing.sm,
            bottom: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: shape.lg * 2,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            shadowColor: colors.shadow,
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 12,
          },
          sheetStyle,
        ]}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 5,
            borderRadius: 3,
            marginVertical: spacing.sm,
            backgroundColor: colors.tertiaryLabel,
          }}
        />
        <Group title="Capture">{capture.map(item)}</Group>
        {track.length > 0 ? <Group title="Track">{track.map(item)}</Group> : null}
        {last ? (
          <Pressable
            testID="quick-menu-last"
            accessibilityRole="button"
            accessibilityLabel={`${last.action.label}${last.caption ? `, ${last.caption}` : ''}`}
            onPress={() => onRun(last.action)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing.md,
              paddingTop: spacing.md,
              borderTopWidth: 1,
              borderTopColor: colors.separator,
            }}
          >
            <Chip action={last.action} size={32} />
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
              {last.action.label}
            </Text>
            <Text variant="footnote" tone="secondary">
              {last.caption}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Text variant="footnote" tone="secondary" style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }}>{children}</View>
    </View>
  );
}

function Chip({ action, size }: { action: QuickMenuAction; size: number }) {
  const theme = useTheme();
  const { fg, bg } = tintColors(theme, action.tint);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
      }}
    >
      <Icon name={action.icon} size={size * 0.45} color={fg} />
    </View>
  );
}

function QuickItem({
  action,
  index,
  open,
  onRun,
}: {
  action: QuickMenuAction;
  index: number;
  open: boolean;
  onRun: (action: QuickMenuAction) => void;
}) {
  const { spacing } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(
      open
        ? withDelay(index * STAGGER_MS, withSpring(1, SHEET_SPRING))
        : withTiming(0, { duration: 120 }),
    );
  }, [open, index, p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get()),
    transform: [{ scale: 0.8 + 0.2 * p.get() }],
  }));
  return (
    <Animated.View style={[{ width: '25%', alignItems: 'center' }, style]}>
      <Pressable
        testID={`quick-${action.id}`}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => onRun(action)}
        style={{ alignItems: 'center', gap: spacing.xs }}
      >
        <Chip action={action} size={56} />
        <Text variant="footnote" numberOfLines={1}>
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
