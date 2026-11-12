import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  addTimezone,
  localClock,
  removeTimezone,
  searchZones,
  type WorldClock,
  worldClocksView,
  yearProgress,
} from '../../components/widgets/tile-controllers.js';
import { Button, haptics, Icon, Text, TextField } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { EmptyLine, ItemRow, Meter, Rows, Stat, StatRow } from './parts.js';
import { useLiveNow } from './use-live-now.js';

/** Hermes has no `crypto.randomUUID`; ids only need to be unique within one small file. */
const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function ZoneAddForm({ ctx, onDone }: AddFormProps) {
  const [query, setQuery] = useState('');
  const choices = searchZones(query);
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label="Search city or zone"
        placeholder="Berlin, Tokyo, America/Denver"
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      {query.trim() && choices.length === 0 ? <EmptyLine>No matching zones.</EmptyLine> : null}
      <Rows>
        {choices.map((c) => (
          <ItemRow
            key={c.name}
            title={c.city}
            subtitle={c.name}
            label={`Add ${c.city}`}
            leading={<Icon name="add" size={20} />}
            onPress={() => {
              if (ctx.apply(addTimezone(ctx.content, c.name, newId(), ctx.now))) {
                haptics.success();
                onDone();
              } else haptics.error();
            }}
          />
        ))}
      </Rows>
      <Button label="Cancel" size="medium" variant="plain" onPress={onDone} />
    </View>
  );
}

/** The big clock shows seconds, so the whole tile re-reads the time every second. */
export function Clocks({ clocks: initial, ctx }: { clocks: WorldClock[]; ctx: Ctx }) {
  const now = useLiveNow(ctx.now, 1000);
  const minute = Math.floor(now.getTime() / 60_000);
  // Zone rows show HH:mm, so they only need recomputing when the minute changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `minute` stands in for `now`
  const clocks = useMemo(
    () => (now === ctx.now ? initial : worldClocksView(ctx.content, now)),
    [minute, ctx.now, ctx.content, initial],
  );
  const local = localClock(now);
  const year = yearProgress(now);
  return (
    <>
      <View style={{ gap: 2 }}>
        <Text variant="largeTitle" mono style={{ fontVariant: ['tabular-nums'] }}>
          {local.time}
        </Text>
        <Text variant="subheadline" tone="secondary">
          {local.date}, {local.zone}
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        <StatRow>
          <Stat label="Day of year" value={`${year.dayOfYear}`} unit={`of ${year.daysInYear}`} />
          <Stat label="Days left" value={`${year.daysLeft}`} unit={`${year.percent}% done`} />
        </StatRow>
        <Meter value={year.percent / 100} label={`Year progress, ${year.percent} percent`} />
      </View>
      {clocks.length === 0 ? (
        <EmptyLine>No time zones configured.</EmptyLine>
      ) : (
        <Rows>
          {clocks.map((c) => {
            const city = c.cities[0] ?? c.name;
            return (
              <ItemRow
                key={c.id}
                title={city}
                subtitle={`${c.date}, UTC${c.offset}`}
                label={`${city}, ${c.time}`}
                actions={[
                  {
                    label: `Remove ${city}`,
                    destructive: true,
                    onPress: () => {
                      if (ctx.apply(removeTimezone(ctx.content, c.id))) haptics.light();
                    },
                  },
                ]}
                trailing={
                  <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
                    {c.time}
                  </Text>
                }
              />
            );
          })}
        </Rows>
      )}
    </>
  );
}
