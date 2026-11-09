import type { TodoRepeat, Weekday } from '@kaihuman/formats';
import { MAX_REPEAT_INTERVAL } from '@kaihuman/formats';
import { View } from 'react-native';
import {
  REPEAT_PRESETS,
  repeatEveryLabel,
  repeatFromPreset,
  repeatPreset,
  repeatSummary,
  repeatWeekdays,
  toggleRepeatWeekday,
  WEEKDAY_LABELS,
  withRepeatInterval,
} from '../screens/todo-due.js';
import { useTheme } from '../theme/theme.js';
import { Button, Chip, Text } from '../ui/index.js';

/**
 * Repeat rule for a dated todo: a preset, then "Every N" and, for weekly rules, the weekdays.
 * Presets pin to `dueDate` (weekday, day of month, MM-DD) so the rule matches what was picked.
 */
export function RepeatEditor({
  value,
  dueDate,
  onChange,
}: {
  value: TodoRepeat | undefined;
  dueDate: string;
  onChange: (repeat: TodoRepeat | undefined) => void;
}) {
  const { spacing } = useTheme();
  const preset = repeatPreset(value);
  const row = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  } as const;
  const days = value ? repeatWeekdays(value, dueDate) : [];

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="subheadline" tone="secondary">
        Repeat
      </Text>
      <View style={row}>
        {REPEAT_PRESETS.map((p) => (
          <Chip
            key={p.value}
            label={p.label}
            selected={preset === p.value}
            accessibilityLabel={`Repeat ${p.label}`}
            onPress={() => {
              if (p.value === preset) return;
              const next = repeatFromPreset(p.value, dueDate);
              // Keep a custom interval when switching between units.
              onChange(next && value ? withRepeatInterval(next, value.interval) : next);
            }}
          />
        ))}
      </View>
      {value ? (
        <>
          <View style={row}>
            <Button
              label="−"
              variant="tinted"
              size="small"
              testID="repeat-less"
              accessibilityLabel="Decrease repeat interval"
              disabled={value.interval <= 1}
              onPress={() => onChange(withRepeatInterval(value, value.interval - 1))}
            />
            <Text variant="body" testID="repeat-every">
              {repeatEveryLabel(value)}
            </Text>
            <Button
              label="+"
              variant="tinted"
              size="small"
              testID="repeat-more"
              accessibilityLabel="Increase repeat interval"
              disabled={value.interval >= MAX_REPEAT_INTERVAL}
              onPress={() => onChange(withRepeatInterval(value, value.interval + 1))}
            />
          </View>
          {value.unit === 'week' ? (
            <View style={row}>
              {WEEKDAY_LABELS.map((label, i) => (
                <Chip
                  key={label}
                  label={label}
                  selected={days.includes(i as Weekday)}
                  accessibilityLabel={`On ${label}`}
                  onPress={() => onChange(toggleRepeatWeekday(value, i as Weekday, dueDate))}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <Text variant="footnote" tone="secondary" testID="repeat-summary">
        {repeatSummary(value)}
      </Text>
    </View>
  );
}
