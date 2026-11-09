import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import {
  CHART_MODES,
  type ChartMode,
  type ChartView,
  chartView,
  formatHours,
  labelIndices,
  linePath,
} from '../../components/widgets/timetracking-tile.js';
import { useTheme } from '../../theme/theme.js';
import { SegmentedControl, Text } from '../../ui/index.js';
import { EmptyLine } from './parts.js';

const CHART_HEIGHT = 120;
/** Used until the first layout pass reports the real width. */
const FALLBACK_WIDTH = 280;
/** Bar charts show the latest N buckets so bars stay a readable width on a phone. */
const MAX_BARS = 12;

function AxisLabels({ labels }: { labels: readonly string[] }) {
  const shown = labelIndices(labels.length);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {shown.map((i) => (
        <Text key={labels[i]} variant="caption2" tone="secondary" mono>
          {labels[i]}
        </Text>
      ))}
    </View>
  );
}

function LineChart({ view, width }: { view: ChartView; width: number }) {
  const { colors } = useTheme();
  const work = view.points.map((p) => p.work);
  const breaks = view.points.map((p) => p.breaks);
  return (
    <Svg
      testID="daily-chart"
      width={width}
      height={CHART_HEIGHT}
      accessibilityLabel="Daily work and break hours"
    >
      <Path
        d={linePath(breaks, view.maxHours, width, CHART_HEIGHT)}
        fill="none"
        stroke={colors.secondaryLabel}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      <Path
        d={linePath(work, view.maxHours, width, CHART_HEIGHT)}
        fill="none"
        stroke={colors.accent}
        strokeWidth={2}
      />
    </Svg>
  );
}

function BarChart({ view }: { view: ChartView }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}
      accessibilityLabel={`${view.mode} work hours`}
    >
      {view.points.map((p) => (
        <View
          key={p.label}
          testID={`bar-${p.label}`}
          accessible
          accessibilityLabel={`${p.label}, ${formatHours(p.work)}`}
          style={{
            flex: 1,
            height: `${Math.max(2, (p.work / view.maxHours) * 100)}%`,
            backgroundColor: colors.accent,
            borderRadius: 3,
          }}
        />
      ))}
    </View>
  );
}

export function Charts({ content }: { content: string }) {
  const { colors, spacing } = useTheme();
  const [mode, setMode] = useState<ChartMode>('daily');
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const view = useMemo(() => {
    const full = chartView(content, mode);
    return mode === 'daily' ? full : { ...full, points: full.points.slice(-MAX_BARS) };
  }, [content, mode]);
  return (
    <View style={{ gap: spacing.sm }}>
      <SegmentedControl options={CHART_MODES} value={mode} onChange={setMode} />
      {view.points.length === 0 ? (
        <EmptyLine>No tracked time in the last year.</EmptyLine>
      ) : (
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
          style={{ gap: spacing.xs }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption2" tone="secondary" mono>
              {`${formatHours(view.maxHours)} max`}
            </Text>
            <Text variant="caption2" tone="secondary" mono>
              {`${formatHours(view.totalHours)} total`}
            </Text>
          </View>
          {mode === 'daily' ? <LineChart view={view} width={width} /> : <BarChart view={view} />}
          <AxisLabels labels={view.points.map((p) => p.label)} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Text variant="caption2" style={{ color: colors.accent }}>
              Work hours
            </Text>
            {mode === 'daily' ? (
              <Text variant="caption2" tone="secondary">
                Breaks (dashed)
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
