import { type BusinessRepo, type TimeEntry, timerToEntry } from '@kaihuman/formats/business';
import { useState } from 'react';
import { View } from 'react-native';
import {
  entryFromForm,
  fieldErrors,
  formatHours,
  HOURS_HINT,
  type TimeField,
  type TimeForm,
} from '../business/forms.js';
import { useTheme } from '../theme/theme.js';
import { Button, Chip, haptics, Text, TextField } from '../ui/index.js';

export interface BusinessTimeSheetProps {
  repo: BusinessRepo;
  today: string;
  now: Date;
  client?: string;
  project?: string;
  /** Prefill from the running timer and stop it on save. */
  fromTimer?: boolean;
  /** Resolves true when saved. */
  onSubmit: (entry: Omit<TimeEntry, 'id'>, opts: { stopTimer: boolean }) => Promise<boolean>;
  onClose: () => void;
}

function initialForm(p: BusinessTimeSheetProps, stopping: boolean): TimeForm {
  if (stopping && p.repo.timer) {
    const e = timerToEntry(p.repo.timer, p.now);
    return {
      client: e.client,
      project: e.project ?? '',
      date: e.date,
      hours: formatHours(e.minutes),
      note: e.note,
    };
  }
  // A single client needs no choice.
  const only = p.repo.clients.length === 1 ? p.repo.clients[0]?.slug : undefined;
  return {
    client: p.client ?? only ?? '',
    project: p.project ?? '',
    date: p.today,
    hours: '',
    note: '',
  };
}

export function BusinessTimeSheet(props: BusinessTimeSheetProps) {
  const { repo, onSubmit, onClose } = props;
  const { spacing } = useTheme();
  const stopping = !!props.fromTimer && repo.timer !== null;
  const [form, setForm] = useState<TimeForm>(() => initialForm(props, stopping));
  const [errors, setErrors] = useState<Partial<Record<TimeField, string>>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TimeForm>) => setForm((f) => ({ ...f, ...patch }));
  const projects = repo.projects.filter((p) => p.client === form.client && p.status !== 'done');

  const save = async () => {
    const result = entryFromForm(form);
    setErrors(fieldErrors<TimeField>(result));
    if (!result.ok) {
      haptics.error();
      return;
    }
    setSaving(true);
    const ok = await onSubmit(result.value, { stopTimer: stopping });
    setSaving(false);
    if (ok) haptics.success();
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }} testID="business-time-sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Cancel" variant="plain" size="medium" onPress={onClose} />
        <Text variant="headline" accessibilityRole="header">
          {stopping ? 'Stop timer' : 'Log time'}
        </Text>
        <Button
          label="Save"
          variant="plain"
          size="medium"
          loading={saving}
          onPress={() => void save()}
          testID="business-time-save"
        />
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text variant="footnote" tone="secondary">
          Client
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {repo.clients.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={form.client === c.slug}
              accessibilityLabel={`Client ${c.name}`}
              onPress={() => set({ client: c.slug, project: '' })}
            />
          ))}
        </View>
        {errors.client ? (
          <Text variant="footnote" tone="danger">
            {errors.client}
          </Text>
        ) : null}
      </View>
      {projects.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {projects.map((p) => (
            <Chip
              key={p.slug}
              label={p.name}
              selected={form.project === p.slug}
              accessibilityLabel={`Project ${p.name}`}
              onPress={() => set({ project: form.project === p.slug ? '' : p.slug })}
            />
          ))}
        </View>
      ) : null}
      <TextField
        label="Hours"
        placeholder="1:30"
        value={form.hours}
        onChangeText={(hours) => set({ hours })}
        helper={HOURS_HINT}
        {...(errors.hours ? { error: errors.hours } : {})}
        keyboardType="numbers-and-punctuation"
        autoFocus={!stopping}
        testID="business-time-hours"
      />
      <TextField
        label="Date"
        placeholder="YYYY-MM-DD"
        value={form.date}
        onChangeText={(date) => set({ date })}
        {...(errors.date ? { error: errors.date } : {})}
        autoCapitalize="none"
        testID="business-time-date"
      />
      <TextField
        label="Note"
        placeholder="What did you do?"
        value={form.note}
        onChangeText={(note) => set({ note })}
        {...(errors.note ? { error: errors.note } : {})}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        testID="business-time-note"
      />
    </View>
  );
}
