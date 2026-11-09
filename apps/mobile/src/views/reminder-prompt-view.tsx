import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Button, Card, Screen, Text } from '../ui/index.js';

/** One-time soft ask shown before the system permission dialog, so a "no" here costs nothing. */
export function ReminderPromptView({
  onEnable,
  onSkip,
}: {
  onEnable: () => Promise<void>;
  onSkip: () => void;
}) {
  const { spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="Reminders" scroll={false}>
      <Card>
        <View style={{ gap: spacing.md }} testID="reminder-prompt">
          <Text weight="600">Get reminded when todos are due</Text>
          <Text variant="callout" tone="secondary">
            kaihuman can notify you on this device when a todo is due. You can change this later in
            More.
          </Text>
          <Button
            label="Enable"
            fullWidth
            loading={busy}
            testID="reminder-enable"
            onPress={() => {
              setBusy(true);
              void onEnable().finally(() => setBusy(false));
            }}
          />
          <Button
            label="Not now"
            variant="plain"
            fullWidth
            disabled={busy}
            testID="reminder-skip"
            onPress={onSkip}
          />
        </View>
      </Card>
    </Screen>
  );
}
