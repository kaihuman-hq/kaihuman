import { useState } from 'react';
import { View } from 'react-native';
import {
  addBreak,
  BREAK_MINUTES,
  clockIn,
  clockOut,
  formatElapsed,
  type TimerView,
  timeHistoryView,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, SegmentedControl, Text } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, Rows, Stat, StatRow } from './parts.js';

export const hours = (m: number): string => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)}h ${r % 60}m` : `${r} min`;
};

const dayLabel = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

type HistoryMode = 'days' | 'weeks';

function Bar({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ height: 8, borderRadius: 4, backgroundColor: colors.fill, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: 8,
          borderRadius: 4,
          backgroundColor: highlight ? colors.accent : colors.secondaryLabel,
        }}
      />
    </View>
  );
}

export function Timer({ view, ctx }: { view: TimerView; ctx: Ctx }) {
  const [mode, setMode] = useState<HistoryMode>('days');
  const running = view.state === 'running';
  const history = timeHistoryView(ctx.content, ctx.now);
  const weekMax = Math.max(1, ...history.weeks.map((w) => w.minutes));
  const dayMax = Math.max(1, ...history.days.map((d) => d.minutes));

  return (
    <>
      <View style={{ gap: 2 }}>
        <Text variant="largeTitle" mono style={{ fontVariant: ['tabular-nums'] }}>
          {running ? formatElapsed(view.elapsedSeconds) : '0:00:00'}
        </Text>
        <Text variant="subheadline" tone="secondary">
          {running ? `Running since ${view.since}` : 'Not running'}
        </Text>
      </View>
      <StatRow>
        <Stat label="Today" value={hours(view.todayMinutes)} />
        <Stat label="This week" value={hours(history.weekMinutes)} />
      </StatRow>
      <Button
        fullWidth
        variant={running ? 'tinted' : 'filled'}
        label={running ? 'Clock out' : 'Clock in'}
        onPress={() => {
          if (ctx.apply(running ? clockOut(ctx.content, ctx.now) : clockIn(ctx.content, ctx.now))) {
            haptics.medium();
          }
        }}
      />
      <View style={{ gap: 8 }}>
        <Text variant="footnote" tone="secondary">
          Add a break to today
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {BREAK_MINUTES.map((min) => (
            <View key={min} style={{ flex: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                size="medium"
                label={`${min} min break`}
                onPress={() => {
                  if (ctx.apply(addBreak(ctx.content, min, ctx.now))) haptics.success();
                  else haptics.error();
                }}
              />
            </View>
          ))}
        </View>
      </View>
      <SegmentedControl
        options={[
          { value: 'days', label: 'Days' },
          { value: 'weeks', label: 'Weeks' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'days' ? (
        history.days.length === 0 ? (
          <EmptyLine>No tracked time in the last 14 days.</EmptyLine>
        ) : (
          <Rows>
            {history.days.map((d) => (
              <ItemRow
                key={d.date}
                title={d.isToday ? 'Today' : dayLabel(d.date)}
                subtitle={hours(d.minutes)}
                trailing={
                  <View style={{ width: 96 }}>
                    <Bar
                      value={d.minutes / dayMax}
                      label={`${d.date}, ${hours(d.minutes)}`}
                      highlight={d.isToday}
                    />
                  </View>
                }
              />
            ))}
          </Rows>
        )
      ) : (
        <Rows>
          {history.weeks
            .slice()
            .reverse()
            .map((w) => (
              <ItemRow
                key={w.start}
                title={w.isCurrent ? 'This week' : `Week of ${dayLabel(w.start)}`}
                subtitle={hours(w.minutes)}
                trailing={
                  <View style={{ width: 96 }}>
                    <Bar
                      value={w.minutes / weekMax}
                      label={`Week of ${w.start}, ${hours(w.minutes)}`}
                      highlight={w.isCurrent}
                    />
                  </View>
                }
              />
            ))}
        </Rows>
      )}
    </>
  );
}
