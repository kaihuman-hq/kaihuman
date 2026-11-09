import type { TodoDue, TodoRepeat } from '@kaihuman/formats';
import PickerModule, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { type ComponentType, useState } from 'react';
import { Switch, View } from 'react-native';
import { dateFromDue, dueFromDate, dueSummary } from '../screens/todo-due.js';
import { useTheme } from '../theme/theme.js';
import { Button, Text } from '../ui/index.js';
import { RepeatEditor } from './repeat-editor.js';

type Picking = 'date' | 'time' | null;

interface PickerProps {
  value: Date;
  mode: 'date' | 'time';
  display: 'default' | 'inline' | 'spinner';
  is24Hour: boolean;
  testID: string;
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
}

// The package ships CommonJS typings, which TypeScript's ESM resolution reads as the module
// namespace rather than the component; Metro's interop gives the component at runtime.
const DateTimePicker = PickerModule as unknown as ComponentType<PickerProps>;

/**
 * Due date first, then an optional time. The native picker is a dialog on Android (dismissed on
 * pick) and an inline control on iOS (left open until the user taps Done). With
 * `onRepeatChange`, a dated todo also gets the repeat editor; clearing the due is the caller's
 * cue to clear the repeat too.
 */
export function DueEditor({
  value,
  onChange,
  repeat,
  onRepeatChange,
  now = new Date(),
}: {
  value: TodoDue | undefined;
  onChange: (due: TodoDue | undefined) => void;
  repeat?: TodoRepeat;
  onRepeatChange?: (repeat: TodoRepeat | undefined) => void;
  now?: Date;
}) {
  const { spacing, platform } = useTheme();
  const [picking, setPicking] = useState<Picking>(null);
  const current = dateFromDue(value, now);
  const ios = platform === 'ios';

  const onPick = (event: DateTimePickerEvent, picked?: Date) => {
    if (!ios) setPicking(null);
    if (event.type !== 'set' || !picked) return;
    // Merge the half that was picked into the other half of the current value.
    if (picking === 'time') onChange(dueFromDate(current, picked));
    else onChange(dueFromDate(picked, value?.time ? current : undefined));
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="subheadline" tone="secondary">
        Due
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          label={value ? dueSummary({ date: value.date }) : 'Set due date'}
          variant="tinted"
          size="small"
          icon="calendar"
          testID="due-date"
          onPress={() => setPicking(picking === 'date' ? null : 'date')}
        />
        {value ? (
          <Button
            label="Clear"
            variant="plain"
            size="small"
            testID="due-clear"
            onPress={() => {
              setPicking(null);
              onChange(undefined);
            }}
          />
        ) : null}
      </View>
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="body">Add a time</Text>
          <Switch
            testID="due-time-toggle"
            accessibilityLabel="Add a time"
            value={Boolean(value.time)}
            onValueChange={(on) => {
              setPicking(null);
              onChange(on ? dueFromDate(current, current) : { date: value.date });
            }}
          />
          {value.time ? (
            <Button
              label={value.time}
              variant="tinted"
              size="small"
              icon="timer"
              testID="due-time"
              onPress={() => setPicking(picking === 'time' ? null : 'time')}
            />
          ) : null}
        </View>
      ) : null}
      {value && onRepeatChange ? (
        <RepeatEditor value={repeat} dueDate={value.date} onChange={onRepeatChange} />
      ) : null}
      {picking ? (
        <DateTimePicker
          testID="due-picker"
          value={current}
          mode={picking}
          is24Hour
          display={ios ? (picking === 'date' ? 'inline' : 'spinner') : 'default'}
          onChange={onPick}
        />
      ) : null}
    </View>
  );
}
