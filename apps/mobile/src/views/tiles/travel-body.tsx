import {
  type CustomField,
  emptyStep,
  mapsLink,
  money,
  STEP_FIELDS,
  STEP_LABEL,
  STEP_TYPES,
  type StepType,
  type TravelStep,
  type Trip,
} from '@kaihuman/formats';
import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  addTravelTrip,
  findTrip,
  moveItem,
  parseCost,
  removeTrip,
  safeHref,
  saveTrip,
  setStepField,
  stepSummary,
  stepValue,
  type TravelView,
  type TripRow,
} from '../../components/widgets/travel-tile.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, Chip, haptics, Text, TextField } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { EmptyLine, Err, FormButtons, ItemRow, Rows } from './parts.js';
import { confirmDestructive, TileSheet } from './tile-sheet.js';

const TRIP_TONE: Record<TripRow['status'], 'success' | 'accent' | 'neutral'> = {
  current: 'success',
  upcoming: 'accent',
  past: 'neutral',
};

export function TripAddForm({ ctx, onDone }: AddFormProps) {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const save = () => {
    const result = addTravelTrip(
      ctx.content,
      { name, destination, start, end },
      randomUUID().slice(0, 8),
    );
    if (ctx.apply(result)) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label="Trip name"
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="next"
      />
      <TextField
        label="Destination"
        value={destination}
        onChangeText={setDestination}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <TextField
        label="Start (YYYY-MM-DD)"
        value={start}
        onChangeText={setStart}
        placeholder="2026-12-24"
        keyboardType="numbers-and-punctuation"
        returnKeyType="next"
      />
      <TextField
        label="End (YYYY-MM-DD)"
        value={end}
        onChangeText={setEnd}
        placeholder="2026-12-31"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <FormButtons saveLabel="Save trip" onSave={save} onCancel={onDone} />
    </>
  );
}

export function Travel({ view, ctx }: { view: TravelView; ctx: Ctx }) {
  const { colors, spacing, shape } = useTheme();
  const [editing, setEditing] = useState<string | null>(null);
  const askDelete = (row: TripRow) =>
    confirmDestructive(
      'Delete trip?',
      `"${row.name}" and its steps will be removed.`,
      'Delete',
      () => {
        if (ctx.apply(removeTrip(ctx.content, row.id))) haptics.success();
      },
    );
  return (
    <>
      {view.next ? (
        <View
          accessibilityLabel={`Next trip, ${view.next.name}, ${view.next.daysUntil} days`}
          accessible
          style={{
            backgroundColor: colors.accentSoft,
            borderRadius: shape.md,
            padding: spacing.md,
            gap: spacing.xxs,
          }}
        >
          <Text variant="caption2" weight="600" style={{ textTransform: 'uppercase' }}>
            Next trip
          </Text>
          <Text variant="title3">{view.next.name}</Text>
          <Text variant="subheadline" tone="secondary">
            {view.next.daysUntil === 0
              ? 'Starts today'
              : `In ${view.next.daysUntil} ${view.next.daysUntil === 1 ? 'day' : 'days'}`}
          </Text>
        </View>
      ) : null}
      {view.trips.length === 0 ? (
        <EmptyLine>No trips planned.</EmptyLine>
      ) : (
        <Rows>
          {view.trips.map((t) => (
            <ItemRow
              key={t.id}
              testID={`trip-${t.id}`}
              title={t.name}
              label={`Edit trip ${t.name}`}
              subtitle={[
                t.destination,
                t.dateRange,
                `${t.steps} ${t.steps === 1 ? 'step' : 'steps'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => setEditing(t.id)}
              actions={[
                { label: 'Edit trip', onPress: () => setEditing(t.id) },
                { label: 'Delete trip', destructive: true, onPress: () => askDelete(t) },
              ]}
              trailing={
                <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                  <Text variant="subheadline" mono>
                    {t.costLabel}
                  </Text>
                  <Badge tone={TRIP_TONE[t.status]} label={t.status} />
                </View>
              }
            />
          ))}
        </Rows>
      )}
      {view.trips.length > 0 ? (
        <Text variant="footnote" tone="secondary">
          {`Total ${view.totalLabel}`}
        </Text>
      ) : null}
      {editing ? (
        <TripSheet
          key={editing}
          tripId={editing}
          currency={view.currency}
          ctx={ctx}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** Edits one trip on a local draft; nothing reaches the file until Save. */
export function TripSheet({
  tripId,
  currency,
  ctx,
  onClose,
}: {
  tripId: string;
  currency: string;
  ctx: Ctx;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const [draft, setDraft] = useState<Trip | undefined>(() => findTrip(ctx.content, tripId));
  const [newType, setNewType] = useState<StepType>('flight');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return (
      <TileSheet title="Trip not found" onClose={onClose}>
        <Text variant="subheadline" tone="secondary">
          This trip was removed from the file.
        </Text>
        <Button label="Close" variant="tinted" fullWidth onPress={onClose} />
      </TileSheet>
    );
  }
  const patch = (p: Partial<Trip>) => setDraft({ ...draft, ...p });
  const patchOptional = (key: 'start' | 'end' | 'destination' | 'notes', value: string) => {
    const { [key]: _drop, ...rest } = draft;
    setDraft(value ? { ...rest, [key]: value } : rest);
  };
  const patchStep = (id: string, fn: (s: TravelStep) => TravelStep) =>
    patch({ steps: draft.steps.map((s) => (s.id === id ? fn(s) : s)) });
  const addStepOfType = () => {
    const step = emptyStep(newType, randomUUID().slice(0, 8));
    patch({ steps: [...draft.steps, step] });
    setOpen(step.id);
  };

  const submit = () => {
    const result = saveTrip(ctx.content, draft);
    if (!result.ok) {
      setError(result.error);
      haptics.error();
      return;
    }
    if (ctx.apply(result)) {
      haptics.success();
      onClose();
    }
  };
  const askDelete = () =>
    confirmDestructive(
      'Delete trip?',
      `"${draft.title || 'Untitled trip'}" and its steps will be removed.`,
      'Delete',
      () => {
        if (ctx.apply(removeTrip(ctx.content, tripId))) {
          haptics.success();
          onClose();
        }
      },
    );

  return (
    <TileSheet
      title="Edit trip"
      onClose={onClose}
      testID="trip-sheet"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Err error={error} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Save" testID="trip-save" onPress={submit} fullWidth />
            </View>
            <Button label="Cancel" variant="plain" onPress={onClose} />
          </View>
          <Button label="Delete trip" variant="destructive" fullWidth onPress={askDelete} />
        </View>
      }
    >
      <TextField
        label="Trip title"
        value={draft.title}
        onChangeText={(title) => patch({ title })}
        autoCapitalize="sentences"
      />
      <TextField
        label="Destination"
        value={draft.destination ?? ''}
        onChangeText={(v) => patchOptional('destination', v)}
        autoCapitalize="words"
      />
      <TextField
        label="Start (YYYY-MM-DD)"
        value={draft.start ?? ''}
        onChangeText={(v) => patchOptional('start', v)}
        placeholder="2026-12-24"
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label="End (YYYY-MM-DD)"
        value={draft.end ?? ''}
        onChangeText={(v) => patchOptional('end', v)}
        placeholder="2026-12-31"
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label="Trip notes"
        value={draft.notes ?? ''}
        onChangeText={(v) => patchOptional('notes', v)}
        autoCapitalize="sentences"
        multiline
      />
      <CustomFieldsEditor
        prefix="Trip field"
        fields={draft.custom}
        onFields={(custom) => patch({ custom })}
      />

      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        Steps
      </Text>
      {draft.steps.length === 0 ? <EmptyLine>No steps yet.</EmptyLine> : null}
      <Rows>
        {draft.steps.map((step, i) => (
          <StepEditor
            key={step.id}
            step={step}
            currency={currency}
            open={open === step.id}
            first={i === 0}
            last={i === draft.steps.length - 1}
            onToggle={() => setOpen(open === step.id ? null : step.id)}
            onChange={(fn) => patchStep(step.id, fn)}
            onMove={(dir) => patch({ steps: moveItem(draft.steps, i, dir) })}
            onDelete={() => patch({ steps: draft.steps.filter((s) => s.id !== step.id) })}
          />
        ))}
      </Rows>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {STEP_TYPES.map((t) => (
            <Chip
              key={t}
              label={STEP_LABEL[t]}
              selected={newType === t}
              onPress={() => setNewType(t)}
              accessibilityLabel={`Step type ${STEP_LABEL[t]}`}
            />
          ))}
        </View>
      </ScrollView>
      <Button label="Add step" icon="add" variant="tinted" fullWidth onPress={addStepOfType} />
    </TileSheet>
  );
}

function StepEditor({
  step,
  currency,
  open,
  first,
  last,
  onToggle,
  onChange,
  onMove,
  onDelete,
}: {
  step: TravelStep;
  currency: string;
  open: boolean;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onChange: (fn: (s: TravelStep) => TravelStep) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { spacing } = useTheme();
  const label = STEP_LABEL[step.type];
  const set = (key: string, value: string | number | CustomField[] | undefined) =>
    onChange((s) => setStepField(s, key, value));
  const maps = safeHref(mapsLink(step));
  const website = safeHref(step.website);
  return (
    <View testID={`step-${step.id}`}>
      <ItemRow
        title={label}
        label={`${open ? 'Collapse' : 'Edit'} step ${label}`}
        subtitle={stepSummary(step)}
        expanded={open}
        onPress={onToggle}
        trailing={
          'cost' in step ? (
            <Text variant="subheadline" mono>
              {money(step.cost, currency)}
            </Text>
          ) : undefined
        }
      />
      {open ? (
        <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
          {STEP_FIELDS[step.type].map((f) => (
            <TextField
              key={f.key}
              label={`Step ${f.label}`}
              value={stepValue(step, f.key)}
              onChangeText={(v) => set(f.key, v)}
              placeholder={f.type === 'date' ? '2026-12-24' : undefined}
              keyboardType={f.type === 'date' ? 'numbers-and-punctuation' : undefined}
              autoCapitalize={f.type === 'date' ? 'none' : 'sentences'}
            />
          ))}
          <TextField
            label="Step address"
            value={step.address ?? ''}
            onChangeText={(v) => set('address', v || undefined)}
            autoCapitalize="words"
          />
          <TextField
            label="Step maps URL"
            value={step.mapsUrl ?? ''}
            onChangeText={(v) => set('mapsUrl', v || undefined)}
            keyboardType="url"
          />
          <TextField
            label="Step website"
            value={step.website ?? ''}
            onChangeText={(v) => set('website', v || undefined)}
            keyboardType="url"
          />
          {'cost' in step ? <CostField cost={step.cost} onCost={(c) => set('cost', c)} /> : null}
          <CustomFieldsEditor
            prefix="Step field"
            fields={step.custom}
            onFields={(custom) => set('custom', custom)}
          />
          {website || maps ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {website ? (
                <Button
                  label="Website"
                  size="small"
                  variant="outlined"
                  onPress={() => void openBrowserAsync(website).catch(() => {})}
                />
              ) : null}
              {maps ? (
                <Button
                  label="Open in Maps"
                  size="small"
                  variant="outlined"
                  onPress={() => void openBrowserAsync(maps).catch(() => {})}
                />
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Move step up"
              size="small"
              variant="outlined"
              icon="sort"
              disabled={first}
              onPress={() => onMove(-1)}
            />
            <Button
              label="Move step down"
              size="small"
              variant="outlined"
              disabled={last}
              onPress={() => onMove(1)}
            />
            <Button
              label="Delete step"
              size="small"
              variant="destructive"
              icon="trash"
              onPress={onDelete}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Keeps the typed text so "12." survives a re-render; only the parsed number is reported. */
function CostField({ cost, onCost }: { cost: number; onCost: (cost: number) => void }) {
  const [text, setText] = useState(String(cost));
  return (
    <TextField
      label="Step cost"
      value={text}
      onChangeText={(v) => {
        setText(v);
        onCost(parseCost(v));
      }}
      keyboardType="decimal-pad"
    />
  );
}

function CustomFieldsEditor({
  prefix,
  fields,
  onFields,
}: {
  prefix: string;
  fields: CustomField[];
  onFields: (fields: CustomField[]) => void;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {fields.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: custom fields have no id, order is the identity
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={`${prefix} key`}
              value={c.key}
              onChangeText={(key) => onFields(fields.map((f, j) => (j === i ? { ...f, key } : f)))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label={`${prefix} value`}
              value={c.value}
              onChangeText={(value) =>
                onFields(fields.map((f, j) => (j === i ? { ...f, value } : f)))
              }
              autoCapitalize="sentences"
            />
          </View>
          <Button
            label={`Remove ${prefix.toLowerCase()} ${i + 1}`}
            icon="trash"
            size="small"
            variant="plain"
            onPress={() => onFields(fields.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      <Button
        label={`Add ${prefix.toLowerCase()}`}
        icon="add"
        size="small"
        variant="plain"
        onPress={() => onFields([...fields, { key: '', value: '' }])}
      />
    </View>
  );
}
