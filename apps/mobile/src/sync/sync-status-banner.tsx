import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { storageWarning } from '../runtime/storage-boot.js';
import { useTheme } from '../theme/theme.js';
import { Button } from '../ui/button.js';
import { Text } from '../ui/text.js';
import { useSignalValue } from '../views/use-signal.js';
import { describeSyncStatus } from './describe.js';
import { refreshAll, resolveConflict } from './runtime.js';
import { syncStatus } from './status.js';

const TICK_MS = 30_000;

export function SyncStatusBanner() {
  const { colors, spacing, shape } = useTheme();
  const status = useSignalValue(syncStatus);
  const warning = useSignalValue(storageWarning);
  const [, setTick] = useState(0);
  // The relative time ("5 min ago") goes stale without a state change, so re-render on a timer.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Losing data on close outranks any sync state, so it shows first; it never blocks the screen.
  if (warning) {
    return (
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.danger,
          borderWidth: 1,
          borderRadius: shape.md,
          padding: spacing.md,
        }}
      >
        <Text variant="footnote">{warning}</Text>
      </View>
    );
  }

  const { text, tone } = describeSyncStatus(status, Date.now());
  if (!text) return null;

  const conflicts = status.conflicts;
  if (conflicts.length > 0 || tone === 'error') {
    const accent = conflicts.length > 0 ? colors.warning : colors.danger;
    const n = conflicts.length;
    const message = n > 0 ? `${n} ${n === 1 ? 'file' : 'files'} changed on GitHub and here` : text;
    const resolveAll = (choice: 'keep_local' | 'use_remote') => () => {
      for (const path of conflicts) resolveConflict(path, choice);
    };
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          backgroundColor: colors.surface,
          borderColor: accent,
          borderWidth: 1,
          borderRadius: shape.md,
          padding: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Text variant="footnote">{message}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {n > 0 ? (
            <>
              <Button
                label="Keep mine"
                variant="tinted"
                size="small"
                onPress={resolveAll('keep_local')}
              />
              <Button
                label="Use theirs"
                variant="tinted"
                size="small"
                onPress={resolveAll('use_remote')}
              />
            </>
          ) : (
            <Button
              label="Retry"
              variant="tinted"
              size="small"
              onPress={() => void refreshAll({ reason: 'pull' })}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
    >
      {status.phase === 'syncing' ? (
        <ActivityIndicator size="small" color={colors.secondaryLabel} />
      ) : null}
      <Text variant="caption1" tone="secondary">
        {text}
      </Text>
    </View>
  );
}
