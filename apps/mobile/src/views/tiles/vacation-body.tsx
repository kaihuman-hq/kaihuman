import { DESTINATION_STATUSES, type DestinationStatus } from '@kaihuman/formats';
import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import {
  addVacationDestination,
  type DestinationRow,
  type VacationView,
} from '../../components/widgets/vacation-tile.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, Chip, haptics, Text, TextField } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { EmptyLine, FormButtons, ItemRow, Rows } from './parts.js';

const TONE: Record<DestinationStatus, 'success' | 'accent' | 'neutral'> = {
  booked: 'success',
  shortlist: 'accent',
  idea: 'neutral',
  dropped: 'neutral',
};

export function DestinationAddForm({ ctx, onDone }: AddFormProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const save = () => {
    if (ctx.apply(addVacationDestination(ctx.content, { name, price }, randomUUID().slice(0, 8)))) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label="Destination"
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="words"
        returnKeyType="next"
      />
      <TextField
        label="Price"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <FormButtons saveLabel="Save destination" onSave={save} onCancel={onDone} />
    </>
  );
}

const subtitle = (d: DestinationRow) =>
  [d.rating ? `${'★'.repeat(d.rating)}` : undefined, d.priceLabel].filter(Boolean).join(' · ');

export function Vacation({ view }: { view: VacationView; ctx: Ctx }) {
  const { spacing } = useTheme();
  const [status, setStatus] = useState<DestinationStatus | undefined>();
  const rows = status ? view.destinations.filter((d) => d.status === status) : view.destinations;
  return (
    <>
      {view.title || view.window ? (
        <View style={{ gap: spacing.xxs }}>
          {view.title ? <Text variant="title3">{view.title}</Text> : null}
          {view.window ? (
            <Text variant="subheadline" tone="secondary">
              {view.window}
            </Text>
          ) : null}
        </View>
      ) : null}
      {view.destinations.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <Chip label="All" selected={!status} onPress={() => setStatus(undefined)} />
          {DESTINATION_STATUSES.map((s) => (
            <Chip
              key={s}
              label={`${s} ${view.counts.find((c) => c.status === s)?.count ?? 0}`}
              selected={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </View>
      ) : null}
      {rows.length === 0 ? (
        <EmptyLine>No destinations.</EmptyLine>
      ) : (
        <Rows>
          {rows.map((d) => (
            <ItemRow
              key={d.id}
              testID={`destination-${d.id}`}
              title={d.name}
              label={d.name}
              subtitle={subtitle(d)}
              trailing={
                <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                  <Badge tone={TONE[d.status]} label={d.status} />
                  {d.mapsUrl ? (
                    <Button
                      label="Map"
                      variant="plain"
                      onPress={() => openBrowserAsync(d.mapsUrl as string)}
                    />
                  ) : null}
                </View>
              }
            />
          ))}
        </Rows>
      )}
    </>
  );
}
