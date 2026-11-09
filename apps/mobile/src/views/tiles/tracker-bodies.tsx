import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  type HabitDay,
  type HabitView,
  toggleHabitDay,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, Icon, Text } from '../../ui/index.js';
import type { Ctx } from './bodies.js';

export { Consumption } from './consumption-body.js';
export { Stocks } from './stocks-body.js';

import { Stat, StatRow } from './parts.js';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const dayLetter = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? '';
};
const CELL = 14;
const GAP = 3;

/** The web's 20-week activity grid. Tap a day to select it, then check it in or undo it. */
function Heatmap({
  view,
  selected,
  onSelect,
}: {
  view: HabitView;
  selected: string | null;
  onSelect: (d: HabitDay) => void;
}) {
  const { colors } = useTheme();
  const done = view.weeks.flat().filter((d) => d.reached).length;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View
        accessibilityLabel={`Activity, last ${view.weeks.length} weeks, ${done} days reached`}
        testID="habit-heatmap"
        style={{ gap: 4 }}
      >
        <View style={{ height: 14 }}>
          {view.monthLabels.map((m) => (
            <Text
              key={`${m.week}-${m.label}`}
              variant="caption2"
              tone="secondary"
              style={{ position: 'absolute', left: m.week * (CELL + GAP) }}
            >
              {m.label}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {view.weeks.map((week) => (
            <View key={week[0]?.date} style={{ gap: GAP }}>
              {week.map((d) => (
                <Pressable
                  key={d.date}
                  disabled={d.future}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.date}, ${d.reached ? 'done' : 'not done'}`}
                  accessibilityState={{ selected: selected === d.date }}
                  onPress={() => onSelect(d)}
                  hitSlop={2}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 3,
                    opacity: d.future ? 0.3 : 1,
                    backgroundColor: d.reached ? colors.accent : colors.fill,
                    borderWidth: selected === d.date || d.isToday ? 2 : 0,
                    borderColor: selected === d.date ? colors.label : colors.accent,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export function Habit({ view, ctx }: { view: HabitView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const [selected, setSelected] = useState<HabitDay | null>(null);
  const toggle = (date: string, wasReached: boolean) => {
    if (ctx.apply(toggleHabitDay(ctx.content, date, ctx.now))) {
      if (wasReached) haptics.light();
      else haptics.success();
      setSelected(null);
    } else haptics.error();
  };
  const yesterday = view.strip[view.strip.length - 2];
  return (
    <>
      <StatRow>
        <Stat label="Streak" value={String(view.currentStreak)} unit="days" />
        <Stat label="Weeks" value={String(view.weekStreak)} unit="in a row" />
        <Stat label="Total" value={String(view.totalCount)} unit="check-ins" />
      </StatRow>
      <View
        accessible
        accessibilityLabel={`Last seven days, ${view.strip.filter((d) => d.reached).length} reached`}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: spacing.xs,
        }}
      >
        {view.strip.map((d) => (
          <View key={d.date} style={{ alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: d.reached ? colors.accentFill : colors.fill,
                borderWidth: d.isToday && !d.reached ? 2 : 0,
                borderColor: colors.accent,
              }}
            >
              {d.reached ? (
                <Icon name="check" size={16} color={colors.onAccentFill} weight="bold" />
              ) : null}
            </View>
            <Text
              variant="caption2"
              tone={d.isToday ? 'accent' : 'secondary'}
              weight={d.isToday ? '700' : '500'}
            >
              {dayLetter(d.date)}
            </Text>
          </View>
        ))}
      </View>
      <Heatmap
        view={view}
        selected={selected?.date ?? null}
        onSelect={(d) => setSelected(selected?.date === d.date ? null : d)}
      />
      {selected ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="subheadline">{`${selected.date}: ${selected.reached ? 'done' : 'not done'}`}</Text>
          </View>
          <Button
            variant="tinted"
            size="small"
            label={selected.reached ? 'Undo' : 'Check in'}
            onPress={() => toggle(selected.date, selected.reached)}
          />
        </View>
      ) : null}
      <Text variant="footnote" tone="secondary">
        {view.currentStreak > 0
          ? `${view.currentStreak} in a row. Total: ${view.totalCount}`
          : `Start a streak today! Total completed: ${view.totalCount}`}
      </Text>
      <Button
        fullWidth
        variant={view.checkedInToday ? 'tinted' : 'filled'}
        icon={view.checkedInToday ? undefined : 'check'}
        label={view.checkedInToday ? 'Undo check-in' : 'Check in today'}
        onPress={() => toggle(localToday(view), view.checkedInToday)}
      />
      {!view.checkedInYesterday && yesterday ? (
        <Button
          fullWidth
          variant="plain"
          label="Check in yesterday"
          onPress={() => toggle(yesterday.date, false)}
        />
      ) : null}
    </>
  );
}

const localToday = (view: HabitView) => view.strip[view.strip.length - 1]?.date ?? '';
