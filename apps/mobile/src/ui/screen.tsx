import { createContext, type ReactNode, useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../theme/theme.js';
import { useInsets } from './insets.js';
import { Text } from './text.js';

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
  /** Lift content above the keyboard. */
  keyboard?: boolean;
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
}: ScreenProps) {
  const theme = useTheme();
  const insets = useInsets();
  const { spacing, colors } = theme;
  const margin = inset === 'grouped' ? theme.metrics.screenMargin : 0;
  // On native the navigation header already shows the title; only the web preview needs it.
  const inlineTitle = Platform.OS === 'web' && title ? <ScreenTitle>{title}</ScreenTitle> : null;

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
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
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
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
  return keyboard ? (
    <KeyboardAvoidingView
      style={root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    <View style={root}>{body}</View>
  );
}

export function useScreenInset(): ScreenInset {
  return useContext(ScreenInsetContext);
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
