import { localDate } from '@kaihuman/formats';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  addCollectionEntry,
  type CollectionFilter,
  collectionDetail,
} from '../../components/widgets/collection-tile.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, useDisclosure } from './parts.js';

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const FILTERS: readonly { value: CollectionFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: '6M', label: '6M' },
  { value: '12M', label: '12M' },
  { value: 'YTD', label: 'YTD' },
];

const BAR_AREA = 48;

export function Collection({ ctx }: { ctx: Ctx }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<CollectionFilter>('ALL');
  const detail = useMemo(
    () => collectionDetail(ctx.content, ctx.now, filter),
    [ctx.content, ctx.now, filter],
  );
  const form = useDisclosure();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const today = localDate(ctx.now);
  // Date fields start on today because that is what an entry nearly always is.
  const fieldValue = (name: string, type: string) => draft[name] ?? (type === 'date' ? today : '');

  const save = () => {
    const values = Object.fromEntries(
      detail.inputColumns.map((c) => [c.name, fieldValue(c.name, c.type)]),
    );
    if (ctx.apply(addCollectionEntry(ctx.content, values, ctx.now))) {
      haptics.success();
      setDraft({});
      form.hide();
    } else haptics.error();
  };

  return (
    <>
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      {detail.series.length === 0 ? (
        <EmptyLine>
          {filter === 'ALL' ? 'No numeric columns yet.' : 'No numeric entries in this period.'}
        </EmptyLine>
      ) : (
        <View style={{ gap: 16 }}>
          {detail.series.map((s) => (
            <View key={s.column} style={{ gap: 6 }}>
              <ItemRow
                title={s.column}
                subtitle={`${num(s.min)} to ${num(s.max)}, avg ${num(s.average)}`}
                trailing={
                  <Text variant="title3" mono style={{ fontVariant: ['tabular-nums'] }}>
                    {`${num(s.latest)} ${s.unit}`.trim()}
                  </Text>
                }
              />
              <View
                accessibilityLabel={`${s.column} recent values`}
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_AREA }}
              >
                {s.bars.map((b, i) => (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder
                    key={i}
                    accessibilityLabel={`${s.column} ${b.label}: ${num(b.value)}`}
                    style={{
                      flex: 1,
                      height: Math.max(2, b.fraction * BAR_AREA),
                      borderRadius: 2,
                      backgroundColor: colors.accentFill,
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {detail.recent.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text
            variant="footnote"
            tone="secondary"
            weight="600"
            style={{ textTransform: 'uppercase' }}
          >
            Recent
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {detail.columns.map((c) => (
              <View key={c.name} style={{ flex: 1 }}>
                <Text variant="caption2" tone="secondary" weight="600" numberOfLines={1}>
                  {c.name}
                </Text>
              </View>
            ))}
          </View>
          {detail.recent.map((row, ri) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id of their own
              key={ri}
              style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}
            >
              {detail.columns.map((c, ci) => (
                <View key={c.name} style={{ flex: 1 }}>
                  <Text variant="footnote" numberOfLines={1}>
                    {(row[ci] ?? '').slice(0, c.type.includes('date') ? 10 : undefined)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {detail.inputColumns.length === 0 ? null : form.open ? (
        <View style={{ gap: 12 }}>
          {detail.inputColumns.map((c) => (
            <TextField
              key={c.name}
              label={c.unit ? `${c.name} (${c.unit})` : c.name}
              value={fieldValue(c.name, c.type)}
              onChangeText={(t) => setDraft((d) => ({ ...d, [c.name]: t }))}
              keyboardType={
                c.type === 'number'
                  ? 'decimal-pad'
                  : c.type === 'date'
                    ? 'numbers-and-punctuation'
                    : 'default'
              }
              helper={c.type === 'date' ? 'YYYY-MM-DD' : undefined}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Save entry" size="medium" onPress={save} />
            <Button label="Cancel" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </View>
      ) : (
        <Button label="Add entry" icon="add" size="medium" variant="tinted" onPress={form.show} />
      )}
    </>
  );
}
