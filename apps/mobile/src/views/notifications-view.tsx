import { useState } from 'react';
import { Switch, View } from 'react-native';
import type { NotificationSettings } from '../notifications/planner.js';
import { useTheme } from '../theme/theme.js';
import { Button, Chip, ListRow, Screen, Section, Text } from '../ui/index.js';

const MORNING_TIMES = ['07:00', '08:00', '09:00', '10:00'] as const;
const MINUTES_BEFORE = [5, 15, 30, 60] as const;

const KIND_ROWS = [
  { key: 'dueToday', title: 'Due today', subtitle: 'Todos whose milestone is due today' },
  { key: 'dueSoon', title: 'Due soon (timed)', subtitle: 'A heads-up before a timed due date' },
  { key: 'overdue', title: 'Overdue summary', subtitle: 'What slipped past its due date' },
  { key: 'milestoneTomorrow', title: 'Milestone due tomorrow', subtitle: 'The day before' },
] as const;

export interface NotificationsViewProps {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  /** Resolves `'denied'` when the OS refused permission; the view then points to system settings. */
  onToggleEnabled: (on: boolean) => Promise<'granted' | 'denied'>;
  onOpenSettings: () => void;
}

export function NotificationsView({
  settings,
  onChange,
  onToggleEnabled,
  onOpenSettings,
}: NotificationsViewProps) {
  const { spacing, colors } = useTheme();
  const [denied, setDenied] = useState(false);

  const toggle = (label: string, value: boolean, onValueChange: (v: boolean) => void) => (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.accentFill }}
    />
  );
  const chips = <T extends string | number>(
    values: readonly T[],
    selected: T,
    label: (v: T) => string,
    pick: (v: T) => void,
  ) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md }}>
      {values.map((v) => (
        <Chip key={String(v)} label={label(v)} selected={v === selected} onPress={() => pick(v)} />
      ))}
    </View>
  );

  return (
    <Screen title="Notifications">
      <Section footer="Reminders are scheduled on this device from the todos the app has loaded.">
        <ListRow
          testID="notifications-enabled"
          title="Reminders"
          subtitle="Due dates and milestones"
          icon="clock"
          iconTone="danger"
          accessory={toggle('Reminders', settings.enabled, (on) => {
            setDenied(false);
            void onToggleEnabled(on).then((r) => setDenied(r === 'denied'));
          })}
        />
      </Section>
      {denied ? (
        <View testID="notifications-denied" style={{ gap: spacing.sm }}>
          <Text variant="subheadline" tone="secondary">
            Notifications are blocked for kaihuman. Allow them in system settings to get reminders.
          </Text>
          <Button
            label="Open Settings"
            onPress={onOpenSettings}
            testID="notifications-open-settings"
          />
        </View>
      ) : null}
      {settings.enabled ? (
        <>
          <Section header="Morning">
            <ListRow
              title="Daily digest"
              subtitle="One summary each morning"
              accessory={toggle('Daily digest', settings.digest, (digest) =>
                onChange({ ...settings, digest }),
              )}
            />
            {chips(
              MORNING_TIMES,
              settings.morningTime as (typeof MORNING_TIMES)[number],
              (t) => t,
              (morningTime) => onChange({ ...settings, morningTime }),
            )}
          </Section>
          <Section header="Minutes before a timed due date">
            {chips(
              MINUTES_BEFORE,
              settings.minutesBefore as (typeof MINUTES_BEFORE)[number],
              (m) => `${m} min`,
              (minutesBefore) => onChange({ ...settings, minutesBefore }),
            )}
          </Section>
          <Section header="Remind me about">
            {KIND_ROWS.map((k) => (
              <ListRow
                key={k.key}
                testID={`notifications-kind-${k.key}`}
                title={k.title}
                subtitle={k.subtitle}
                accessory={toggle(k.title, settings.kinds[k.key], (v) =>
                  onChange({ ...settings, kinds: { ...settings.kinds, [k.key]: v } }),
                )}
              />
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
