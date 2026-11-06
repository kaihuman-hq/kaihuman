import type { TodoStatus } from '@kaihuman/formats';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { TimeFrame, TodoAnalyticsController } from '../screens/todo-analytics.js';
import { useTheme } from '../theme/theme.js';
import {
  Card,
  EmptyState,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  StatTile,
  Text,
} from '../ui/index.js';

const FRAMES: { value: TimeFrame; label: string }[] = [
  { value: '4W', label: '4W' },
  { value: '13W', label: '13W' },
  { value: '52W', label: '52W' },
  { value: 'ALL', label: 'All' },
];

const STATUS_LABEL: Record<TodoStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  done: 'Done',
  rejected: 'Rejected',
};

const MAX_WEEKS = 12;

/** `2026-W38` to `W38`: the year is implied by the order. */
const weekShort = (week: string) => week.slice(week.indexOf('W'));

function Bar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.fill,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}

export function TodoAnalyticsView({ controller }: { controller: TodoAnalyticsController }) {
  const { spacing } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [frame, setFrame] = useState<TimeFrame>('13W');

  const reload = useCallback(async () => {
    try {
      await controller.load();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [controller]);

  useEffect(() => {
    let live = true;
    reload().finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [reload]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  if (!loaded) {
    return (
      <Screen title="Todo analytics" scroll={false}>
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator accessibilityLabel="Loading analytics" />
        </View>
      </Screen>
    );
  }

  const summary = controller.summary();
  const velocity = controller.velocity(frame);
  const shown = velocity.slice(-MAX_WEEKS);
  const peak = Math.max(1, ...shown.map((p) => p.count));
  const doneInFrame = velocity.reduce((n, p) => n + p.count, 0);
  const tags = controller.tagDistribution();
  const tagPeak = Math.max(1, ...tags.map((t) => t.count));
  const milestones = controller.milestoneProgress();

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      {error ? (
        <EmptyState
          icon="warning"
          title="Couldn't load analytics"
          message={error}
          action={{ label: 'Try again', onPress: () => void refresh() }}
        />
      ) : summary.total === 0 ? (
        <EmptyState
          icon="analytics"
          title="No todos yet"
          message="Add a few todos and your progress shows up here."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <StatTile
                label="Total"
                value={summary.total}
                icon="todo"
                delta={`${summary.byStatus['in-progress']} in progress`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatTile
                label="Completion"
                value={summary.completionRate === null ? '--' : `${summary.completionRate}%`}
                icon="check"
                tone="success"
                delta={summary.completionRate === null ? 'Nothing closed yet' : 'of closed todos'}
              />
            </View>
          </View>

          <Section header="By status">
            {(Object.keys(STATUS_LABEL) as TodoStatus[]).map((s) => (
              <ListRow key={s} title={STATUS_LABEL[s]} value={String(summary.byStatus[s])} />
            ))}
          </Section>

          <SegmentedControl
            testID="analytics-frame"
            options={FRAMES}
            value={frame}
            onChange={setFrame}
          />
          <Card title="Done per week">
            {shown.length === 0 ? (
              <Text variant="subheadline" tone="secondary">
                Nothing finished in this period.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Text variant="footnote" tone="secondary">
                  {`${doneInFrame} done${velocity.length > shown.length ? `, last ${shown.length} of ${velocity.length} weeks shown` : ''}`}
                </Text>
                {shown.map((p) => (
                  <View
                    key={p.week}
                    accessible
                    accessibilityLabel={`Week ${weekShort(p.week).slice(1)}, ${p.count} done`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                  >
                    <View style={{ width: 40 }}>
                      <Text variant="caption1" tone="secondary" mono>
                        {weekShort(p.week)}
                      </Text>
                    </View>
                    <Bar fraction={p.count / peak} />
                    <View style={{ width: 28 }}>
                      <Text variant="footnote" mono align="right">
                        {String(p.count)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {tags.length > 0 ? (
            <Section header="Tags">
              {tags.map((t) => (
                <ListRow
                  key={t.tag}
                  title={`#${t.tag}`}
                  value={String(t.count)}
                  accessory={
                    <View style={{ width: 56 }}>
                      <Bar fraction={t.count / tagPeak} />
                    </View>
                  }
                />
              ))}
            </Section>
          ) : null}

          {milestones.length > 0 ? (
            <Section header="Milestones">
              {milestones.map((m) => (
                <ListRow
                  key={m.milestone.id}
                  title={m.milestone.name}
                  subtitle={`${m.byStatus.done} of ${m.total} done`}
                  value={`${m.donePct}%`}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
