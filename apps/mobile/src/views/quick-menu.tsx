import { type ReactNode, useEffect, useRef } from 'react';
import { BackHandler, PanResponder, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { QuickMenuAction } from '../screens/quick-menu.js';
import { useTheme } from '../theme/theme.js';
import { Icon, Text } from '../ui/index.js';
import { tintColors } from './tiles/square/tone.js';

// Opens and closes without animation on purpose; only the drag-to-dismiss follows the finger.
const SCRIM_OPACITY = 0.42;
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
 * An overlay above the tab bar rather than a Modal, so the ＋ (shown as × while open) stays on top as the close control.
 */
export function QuickMenu(props: QuickMenuProps) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  return open ? <QuickMenuSheet {...props} /> : null;
}

function QuickMenuSheet({ capture, track, last, onRun, onClose, bottomOffset }: QuickMenuProps) {
  const { colors, spacing, shape } = useTheme();
  const drag = useSharedValue(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Drag down on the sheet closes it past a distance or on a fast flick.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => drag.set(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > 1) onCloseRef.current();
        else drag.set(0);
      },
    }),
  ).current;

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  const item = (a: QuickMenuAction) => <QuickItem key={a.id} action={a} onRun={onRun} />;

  return (
    <View
      testID="quick-menu"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: bottomOffset }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#000',
          opacity: SCRIM_OPACITY,
        }}
      >
        <Pressable
          testID="quick-menu-scrim"
          accessibilityLabel="Close quick menu"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </View>
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
  onRun,
}: {
  action: QuickMenuAction;
  onRun: (action: QuickMenuAction) => void;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ width: '25%', alignItems: 'center' }}>
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
    </View>
  );
}
