import { useMemo, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import {
  CHART_MODES,
  type ChartMode,
  type ChartView,
  chartView,
  formatHours,
  labelIndices,
  linePath,
  pointDetail,
  pointIndexAt,
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

interface ChartProps {
  view: ChartView;
  selected: number | null;
  onSelect: (index: number) => void;
}

function LineChart({ view, width, selected, onSelect }: ChartProps & { width: number }) {
  const { colors } = useTheme();
  const work = view.points.map((p) => p.work);
  const breaks = view.points.map((p) => p.breaks);
  const markerX =
    selected === null || view.points.length <= 1
      ? width / 2
      : (selected / (view.points.length - 1)) * width;
  return (
    <Pressable
      testID="daily-chart-touch"
      accessibilityRole="button"
      accessibilityLabel="Daily chart, tap a point for details"
      onPress={(e: GestureResponderEvent) =>
        onSelect(pointIndexAt(e.nativeEvent.locationX, width, view.points.length))
      }
      style={{ width, height: CHART_HEIGHT }}
    >
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
      {selected !== null ? (
        <View
          pointerEvents="none"
          testID="chart-marker"
          style={{
            position: 'absolute',
            left: markerX - 0.5,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: colors.separator,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function BarChart({ view, selected, onSelect }: ChartProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{ height: CHART_HEIGHT, flexDirection: 'row', gap: 4 }}
      accessibilityLabel={`${view.mode} work hours`}
    >
      {view.points.map((p, i) => (
        <Pressable
          key={p.label}
          testID={`bar-${p.label}`}
          accessibilityRole="button"
          accessibilityLabel={`${p.label}, ${formatHours(p.work)}`}
          onPress={() => onSelect(i)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View
            style={{
              height: `${Math.max(2, (p.work / view.maxHours) * 100)}%`,
              backgroundColor: colors.accent,
              opacity: selected === null || selected === i ? 1 : 0.45,
              borderRadius: 3,
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}

export function Charts({ content }: { content: string }) {
  const { colors, spacing } = useTheme();
  const [mode, setMode] = useState<ChartMode>('daily');
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [selected, setSelected] = useState<number | null>(null);
  const view = useMemo(() => {
    const full = chartView(content, mode);
    return mode === 'daily' ? full : { ...full, points: full.points.slice(-MAX_BARS) };
  }, [content, mode]);
  const point = selected === null ? undefined : view.points[selected];
  const detail = point ? pointDetail(point, mode) : null;
  /** Tapping the selected point again dismisses its callout. */
  const toggle = (i: number) => setSelected((cur) => (cur === i ? null : i));
  return (
    <View style={{ gap: spacing.sm }}>
      <SegmentedControl
        options={CHART_MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setSelected(null);
        }}
      />
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
          {detail ? (
            <Pressable
              testID="chart-callout"
              accessibilityRole="button"
              accessibilityLabel={`${detail.title}, ${detail.lines.join(', ')}. Tap to dismiss`}
              onPress={() => setSelected(null)}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: colors.fill,
                borderRadius: 8,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <Text variant="caption2" tone="secondary" mono>
                {detail.title}
              </Text>
              {detail.lines.map((l) => (
                <Text key={l} variant="caption1" mono>
                  {l}
                </Text>
              ))}
            </Pressable>
          ) : null}
          {mode === 'daily' ? (
            <LineChart view={view} width={width} selected={selected} onSelect={toggle} />
          ) : (
            <BarChart view={view} selected={selected} onSelect={toggle} />
          )}
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
