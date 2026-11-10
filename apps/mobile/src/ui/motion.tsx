import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Reanimated animations and layout transitions default to ReduceMotion.System, so they are
// skipped by themselves when the OS asks for less motion; `useReducedMotion` covers the
// places that branch on it (the swipe-out).
export { useReducedMotion };

const PRESS_SCALE = 0.96;

/** Press feedback: the control shrinks while a finger is on it. Spread `handlers` on the `Pressable`, apply `style` to an `Animated.View` around it. */
export function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    handlers: {
      onPressIn: () => scale.set(withTiming(PRESS_SCALE, { duration: 90 })),
      onPressOut: () => scale.set(withSpring(1, { damping: 14, stiffness: 260 })),
    },
  };
}

/** Skips the entrance of everything already on screen when the list mounts; only later additions animate. */
export function MotionList({ children }: { children: ReactNode }) {
  return <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>;
}

/** A list row that fades in when added, fades out when removed and lets its siblings glide into place. */
export function MotionItem({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.duration(200)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Fades its children in on mount, e.g. an empty state replacing a list. */
export function FadeInView({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Style that pops the element (shrink, then spring back) whenever `on` turns true: the checkbox toggle. */
export function usePop(on: boolean) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (on) {
      scale.set(
        withSequence(
          withTiming(0.7, { duration: 70 }),
          withSpring(1, { damping: 8, stiffness: 300, mass: 0.6 }),
        ),
      );
    }
  }, [on, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}

/**
 * Keys that follow a row's content rather than its index, so removing a middle row animates that
 * row out instead of the last one. Duplicates get an occurrence suffix. Create one per render.
 */
export function contentKeys() {
  const seen = new Map<string, number>();
  return (content: string): string => {
    const n = seen.get(content) ?? 0;
    seen.set(content, n + 1);
    return `${content}#${n}`;
  };
}

export { Animated };
