import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/icon.js';
import { Animated } from '../ui/motion.js';
import { useSignalValue } from '../views/use-signal.js';
import { syncStatus } from './status.js';

/** Passive sync cue for the top bar: an icon that turns only while a sync runs, otherwise absent. */
export function SyncIndicator() {
  const { colors } = useTheme();
  const syncing = useSignalValue(syncStatus).phase === 'syncing';
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!syncing) return;
    turn.set(0);
    turn.set(withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [syncing, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  if (!syncing) return null;
  return (
    <Animated.View testID="sync-indicator" accessibilityLabel="Syncing" style={style}>
      <Icon name="refresh" size={18} color={colors.secondaryLabel} />
    </Animated.View>
  );
}
