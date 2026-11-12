import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PLUS_LIFT, PLUS_SIZE, plusFaceStyle } from '../navigation/app-tab-bar.js';
import type { QuickMenuAction } from '../screens/quick-menu.js';
import { useTheme } from '../theme/theme.js';
import { haptics, Icon, Text } from '../ui/index.js';
import {
  CLOSE_SPRING,
  dragOffset,
  OPEN_SPRING,
  openFraction,
  PLUS_TURN_DEG,
  releaseState,
  SCRIM_OPACITY,
  sheetRise,
  shouldDismiss,
} from './quick-menu-motion.js';
import { tintColors } from './tiles/square/tone.js';

/** Hidden skirt under the sheet so an upward over-pull never shows a gap above the tab bar. */
const SKIRT = 48;

export interface QuickMenuProps {
  open: boolean;
  capture: readonly QuickMenuAction[];
  track: readonly QuickMenuAction[];
  /** Bottom row: the last action and its "used N× today" caption. */
  last: { action: QuickMenuAction; caption: string } | null;
  onRun: (action: QuickMenuAction) => void;
  onClose: () => void;
  /** Height of the tab bar: the sheet rises out of its top edge and the bar stays tappable. */
  bottomOffset: number;
  /** 0 closed … 1 open, shared with the tab bar so its ＋ hands over to the travelling one. */
  progress: SharedValue<number>;
}

/**
 * The ＋ quick menu: Capture (quick-* sheets) and Track (one-tap entries from the user's tiles).
 * An overlay rather than a Modal: the sheet grows out of the tab bar's top edge and the ＋ rides
 * on its top edge, turning into the × that closes it.
 */
export function QuickMenu(props: QuickMenuProps) {
  const { open, onClose, progress } = props;
  // Stays mounted through the closing spring; unmounts when it settles.
  const [mounted, setMounted] = useState(open);
  const height = useSharedValue(0);
  const drag = useSharedValue(0);
  const releaseVelocity = useSharedValue(0);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      drag.set(0);
      setMounted(true);
      // Reopened mid-close: the sheet is still measured, so turn around at once.
      if (height.get() > 0) progress.set(withSpring(1, OPEN_SPRING));
      return;
    }
    const velocity = releaseVelocity.get();
    releaseVelocity.set(0);
    progress.set(
      withSpring(0, { ...CLOSE_SPRING, velocity }, (finished?: boolean) => {
        'worklet';
        if (!finished) return;
        height.set(0);
        scheduleOnRN(setMounted, false);
      }),
    );
  }, [open, progress, height, drag, releaseVelocity]);

  if (!mounted) return null;
  return (
    <QuickMenuSheet {...props} height={height} drag={drag} releaseVelocity={releaseVelocity} />
  );
}

interface SheetProps extends QuickMenuProps {
  height: SharedValue<number>;
  drag: SharedValue<number>;
  releaseVelocity: SharedValue<number>;
}

function QuickMenuSheet({
  open,
  capture,
  track,
  last,
  onRun,
  onClose,
  bottomOffset,
  progress,
  height,
  drag,
  releaseVelocity,
}: SheetProps) {
  const { colors, spacing, shape } = useTheme();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeFromGesture = useCallback(() => onCloseRef.current(), []);
  const openRef = useRef(open);
  openRef.current = open;

  // The first layout gives the height to travel; only then does the sheet start rising.
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height - SKIRT;
    const first = height.get() === 0;
    height.set(h);
    if (first && openRef.current) progress.set(withSpring(1, OPEN_SPRING));
  };

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.set(dragOffset(e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      const h = height.get();
      if (shouldDismiss(e.translationY, e.velocityY, h)) {
        // Fold the drag into progress so the closing spring starts where the finger let go.
        const r = releaseState(drag.get(), e.velocityY, h);
        progress.set(r.progress);
        drag.set(0);
        releaseVelocity.set(r.velocity);
        scheduleOnRN(closeFromGesture);
      } else {
        drag.set(withSpring(0, { ...OPEN_SPRING, velocity: e.velocityY }));
      }
    },
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: SCRIM_OPACITY * openFraction(progress.get(), height.get(), drag.get()),
  }));
  const sheetStyle = useAnimatedStyle(() => {
    const h = height.get();
    return {
      opacity: h > 0 ? 1 : 0,
      transform: [{ translateY: (1 - progress.get()) * h + drag.get() }],
    };
  });
  const plusStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const h = height.get();
    const d = drag.get();
    return {
      transform: [
        { translateY: -sheetRise(p, h, d) },
        { rotate: `${PLUS_TURN_DEG * openFraction(p, h, d)}deg` },
      ],
    };
  });

  const item = (a: QuickMenuAction) => <QuickItem key={a.id} action={a} onRun={onRun} />;

  return (
    <View testID="quick-menu" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Clipped at the tab bar's top edge (hairline included) so the sheet rises out of the bar. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: bottomOffset - StyleSheet.hairlineWidth,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, scrimStyle]}>
          <Pressable
            testID="quick-menu-scrim"
            accessibilityLabel="Close quick menu"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            onLayout={onLayout}
            accessibilityViewIsModal
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: -SKIRT,
                backgroundColor: colors.surface,
                borderTopLeftRadius: shape.lg * 2,
                borderTopRightRadius: shape.lg * 2,
                paddingHorizontal: spacing.lg,
                // Room for the ＋ that sits on the top edge.
                paddingTop: PLUS_SIZE - PLUS_LIFT,
                paddingBottom: spacing.md + SKIRT,
                shadowColor: colors.shadow,
                shadowOpacity: 0.18,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: -6 },
                elevation: 12,
              },
              sheetStyle,
            ]}
          >
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
        </GestureDetector>
      </View>
      {/* Sits exactly over the tab bar's ＋ (which hides while this is up) and rides the sheet's top edge. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '50%',
            marginLeft: -PLUS_SIZE / 2,
            bottom: bottomOffset - (PLUS_SIZE - PLUS_LIFT),
          },
          plusStyle,
        ]}
      >
        <Pressable
          testID="quick-menu-plus"
          accessibilityRole="button"
          accessibilityLabel="Close quick menu"
          onPress={() => {
            haptics.light();
            onClose();
          }}
          style={plusFaceStyle(colors)}
        >
          <Icon name="add" size={28} color={colors.onAccentFill} />
        </Pressable>
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
