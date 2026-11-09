import { View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme/theme.js';

/** Fixed drawing space; the SVG scales to the card width through its viewBox. */
const W = 320;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 22, left: 40 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

/** Compact axis number: `1.2k`, `45`, `3.5`. */
export const axisNumber = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return a >= 10 ? v.toFixed(0) : v.toFixed(1);
};

export interface LineSeries {
  key: string;
  color: string;
  /** One value per x slot; `null` breaks the line. */
  values: readonly (number | null)[];
  dashed?: boolean;
  /** Fill below the line down to the axis. */
  area?: boolean;
  /** Draw a dot at each point. */
  dots?: boolean;
}

export interface LineChartProps {
  label: string;
  series: readonly LineSeries[];
  /** One label per x slot, `''` to skip; only these are drawn. */
  xLabels: readonly string[];
  /** Draw the zero line, for series that cross it (percent change). */
  zeroLine?: boolean;
  testID?: string;
}

const range = (series: readonly LineSeries[], zero: boolean): [number, number] => {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0) return [0, 1];
  const hi = Math.max(...all);
  const lo = zero ? Math.min(0, ...all) : Math.min(...all);
  if (hi === lo) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.08;
  return [zero && lo === 0 ? 0 : lo - pad, hi + pad];
};

/** Multi-series line/area chart on a shared index axis. Pure SVG, no interaction. */
export function LineChart({ label, series, xLabels, zeroLine, testID }: LineChartProps) {
  const { colors } = useTheme();
  const n = Math.max(xLabels.length, ...series.map((s) => s.values.length), 1);
  const [lo, hi] = range(
    series,
    series.some((s) => s.area),
  );
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * CW : CW / 2);
  const y = (v: number) => PAD.top + CH - ((v - lo) / (hi - lo)) * CH;
  const path = (values: readonly (number | null)[]) => {
    let gap = true;
    return values
      .map((v, i) => {
        if (v === null) {
          gap = true;
          return '';
        }
        const cmd = `${gap ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
        gap = false;
        return cmd;
      })
      .filter(Boolean)
      .join(' ');
  };
  const areaPath = (values: readonly (number | null)[]) => {
    const base = y(Math.max(lo, 0));
    const runs: string[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 0) {
        const first = run[0] as number;
        const last = run[run.length - 1] as number;
        const pts = run.map((i) => `L${x(i).toFixed(1)} ${y(values[i] as number).toFixed(1)}`);
        runs.push(
          `M${x(first).toFixed(1)} ${base.toFixed(1)} ${pts.join(' ')} L${x(last).toFixed(1)} ${base.toFixed(1)} Z`,
        );
      }
      run = [];
    };
    values.forEach((v, i) => {
      if (v === null) flush();
      else run.push(i);
    });
    flush();
    return runs.join(' ');
  };
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = PAD.top + t * CH;
          return (
            <G key={t}>
              <Line
                x1={PAD.left}
                y1={gy}
                x2={W - PAD.right}
                y2={gy}
                stroke={colors.separator}
                strokeWidth={0.6}
                strokeDasharray="3 3"
              />
              <SvgText
                x={PAD.left - 4}
                y={gy + 3}
                fontSize={9}
                textAnchor="end"
                fill={colors.secondaryLabel}
              >
                {axisNumber(hi - t * (hi - lo))}
              </SvgText>
            </G>
          );
        })}
        {zeroLine && lo < 0 && hi > 0 ? (
          <Line
            x1={PAD.left}
            y1={y(0)}
            x2={W - PAD.right}
            y2={y(0)}
            stroke={colors.secondaryLabel}
            strokeWidth={0.8}
          />
        ) : null}
        {xLabels.map((l, i) =>
          l ? (
            <SvgText
              // biome-ignore lint/suspicious/noArrayIndexKey: x slots are positional
              key={i}
              x={x(i)}
              y={H - 6}
              fontSize={9}
              textAnchor="middle"
              fill={colors.secondaryLabel}
            >
              {l}
            </SvgText>
          ) : null,
        )}
        {series.map((s) => (
          <G key={s.key}>
            {s.area ? <Path d={areaPath(s.values)} fill={s.color} fillOpacity={0.18} /> : null}
            <Path
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeDasharray={s.dashed ? '5 4' : undefined}
            />
            {s.dots
              ? s.values.map((v, i) =>
                  v === null ? null : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: x slots are positional
                    <Circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.color} />
                  ),
                )
              : null}
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** A coloured key: line sample + text, optionally tappable by the caller. */
export function Swatch({ color }: { color: string }) {
  return <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />;
}

export interface BarGroup {
  label: string;
  /** One non-negative value per bar in the group. */
  values: readonly number[];
}

/** Grouped vertical bars from zero; one colour per bar position. */
export function GroupedBars({
  label,
  groups,
  colors: barColors,
  testID,
}: {
  label: string;
  groups: readonly BarGroup[];
  colors: readonly string[];
  testID?: string;
}) {
  const { colors } = useTheme();
  const hi = Math.max(1, ...groups.flatMap((g) => g.values));
  const slot = CW / Math.max(groups.length, 1);
  const bars = Math.max(barColors.length, 1);
  const barW = Math.max((slot * 0.8) / bars, 1);
  const every = Math.max(Math.ceil(groups.length / 8), 1);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.5, 1].map((t) => {
          const gy = PAD.top + t * CH;
          return (
            <G key={t}>
              <Line
                x1={PAD.left}
                y1={gy}
                x2={W - PAD.right}
                y2={gy}
                stroke={colors.separator}
                strokeWidth={0.6}
                strokeDasharray="3 3"
              />
              <SvgText
                x={PAD.left - 4}
                y={gy + 3}
                fontSize={9}
                textAnchor="end"
                fill={colors.secondaryLabel}
              >
                {axisNumber(hi * (1 - t))}
              </SvgText>
            </G>
          );
        })}
        {groups.map((g, gi) => {
          const x0 = PAD.left + gi * slot + (slot - barW * bars) / 2;
          return (
            <G key={g.label}>
              {g.values.map((v, bi) => {
                const h = (Math.max(v, 0) / hi) * CH;
                return (
                  <Rect
                    // biome-ignore lint/suspicious/noArrayIndexKey: bar position is the identity
                    key={bi}
                    x={x0 + bi * barW}
                    y={PAD.top + CH - h}
                    width={barW}
                    height={h}
                    fill={barColors[bi]}
                  />
                );
              })}
              {gi % every === 0 || gi === groups.length - 1 ? (
                <SvgText
                  x={x0 + (barW * bars) / 2}
                  y={H - 6}
                  fontSize={9}
                  textAnchor="middle"
                  fill={colors.secondaryLabel}
                >
                  {g.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
