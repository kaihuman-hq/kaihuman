import { HeaderHeightContext, HeaderShownContext } from 'expo-router/react-navigation';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import { SyncStatusBanner } from '../sync/sync-status-banner.js';
import { useTheme } from '../theme/theme.js';
import { useInsets } from './insets.js';
import { KeyboardLift, keyboardScrollProps } from './keyboard.js';
import { Text } from './text.js';
import { useKeyboardVisible } from './use-keyboard.js';

export type ScreenInset = 'grouped' | 'none';

/** Lets sections know whether the screen already supplies the horizontal margin. */
export const ScreenInsetContext = createContext<ScreenInset>('none');

export function ScreenTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const ios = theme.platform === 'ios';
  return (
    <Text
      accessibilityRole="header"
      variant={ios ? 'largeTitle' : 'title3'}
      weight={ios ? '700' : '400'}
      style={{ paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}
    >
      {children}
    </Text>
  );
}

export interface ScreenProps {
  children?: ReactNode;
  scroll?: boolean;
  title?: string;
  inset?: ScreenInset;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned below the content (e.g. a primary action). */
  footer?: ReactNode;
  /**
   * Keep inputs reachable above the keyboard. A scrolling screen on iOS does this natively in its
   * scroll view; anything else is lifted.
   */
  keyboard?: boolean;
  /** Show the sync status line; login and capture screens turn it off. */
  syncStatus?: boolean;
  /**
   * Scroll back to the top whenever this changes (e.g. a new search query), so the first row sits
   * fully below the header instead of under it.
   */
  scrollToTopKey?: string;
}

export function Screen({
  children,
  scroll = true,
  title,
  inset = 'grouped',
  refreshing = false,
  onRefresh,
  footer,
  keyboard,
  syncStatus = true,
  scrollToTopKey,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useInsets();
  const keyboardUp = useKeyboardVisible();
  const headerHeight = useContext(HeaderHeightContext);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger, not a value read
  useEffect(() => {
    if (scrollToTopKey === undefined) return;
    // With automatic inset adjustment the resting offset is negative (-header height); a bare
    // `y: 0` would hide the first row behind the bar, so ask the native view to re-apply the inset.
    scrollRef.current?.scrollTo({
      y: Platform.OS === 'ios' ? -(headerHeight ?? 0) : 0,
      animated: false,
    });
  }, [scrollToTopKey]);
  const { spacing, colors } = theme;
  const margin = inset === 'grouped' ? theme.metrics.screenMargin : 0;
  // Native headers already show the title. The web preview hides tab-root headers, so only
  // a screen without a visible header draws the title inline.
  const headerShown = useContext(HeaderShownContext);
  const inlineTitle =
    Platform.OS === 'web' && title && !headerShown ? <ScreenTitle>{title}</ScreenTitle> : null;

  // A pinned footer must rise with the keyboard, so only a plain iOS scroll view skips the lift.
  const lifted = keyboard === true && (Platform.OS !== 'ios' || !scroll || footer !== undefined);
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentInsetAdjustmentBehavior="automatic"
      {...keyboardScrollProps(lifted)}
      keyboardDismissMode="interactive"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondaryLabel}
          />
        ) : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: margin,
        paddingTop: spacing.sm,
        paddingBottom: (footer ? 0 : insets.bottom) + spacing.xl,
        gap: spacing.md,
      }}
    >
      {inlineTitle}
      {syncStatus ? <SyncStatusBanner /> : null}
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        { paddingHorizontal: margin, paddingTop: spacing.sm, gap: spacing.md },
        footer ? null : { paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      {inlineTitle}
      {syncStatus ? <SyncStatusBanner /> : null}
      {children}
    </View>
  );

  const body = (
    <ScreenInsetContext.Provider value={inset}>
      {content}
      {footer ? (
        <View
          style={{
            paddingHorizontal: theme.metrics.screenMargin,
            paddingTop: keyboardUp ? spacing.sm : spacing.md,
            // The home-indicator inset sits under the keyboard; keeping it left a gap above it.
            paddingBottom: keyboardUp ? spacing.sm : insets.bottom + spacing.md,
            backgroundColor: colors.background,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
          }}
        >
          {footer}
        </View>
      ) : null}
    </ScreenInsetContext.Provider>
  );

  const root = { flex: 1, backgroundColor: colors.background } as const;
  return lifted ? (
    <KeyboardLift style={root}>{body}</KeyboardLift>
  ) : (
    <View style={root}>{body}</View>
  );
}

export function useScreenInset(): ScreenInset {
  return useContext(ScreenInsetContext);
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
