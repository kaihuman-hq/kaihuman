import { Pressable, Share, View } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { useTheme } from '../../../theme/theme.js';
import { haptics, Icon, Text } from '../../../ui/index.js';
import type { GlanceViz } from '../glance/types.js';
import { toneColor, vizAccent } from './tone.js';

/** README anatomy: every visual fits in 40 pt so tiles share baselines. */
export const VIZ_HEIGHT = 40;

/** Polyline through `values` scaled into `w`×`h`, with a little headroom for the end dot. */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 3): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function Days({ days }: Extract<GlanceViz, { kind: 'days' }>) {
  const theme = useTheme();
  const on = vizAccent(theme);
  return (
    <View testID="viz-days" style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((d, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
            key={i}
            style={{
              flex: 1,
              height: 22,
              borderRadius: 6,
              backgroundColor: d.on ? on : theme.colors.fill,
              borderWidth: d.today ? 2 : 0,
              borderColor: theme.colors.label,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((d, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional
            key={i}
            variant="caption2"
            tone="tertiary"
            align="center"
            style={{ flex: 1, fontSize: 8, lineHeight: 10 }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Bars({ values, labels, accent }: Extract<GlanceViz, { kind: 'bars' }>) {
  const theme = useTheme();
  const max = Math.max(1, ...values);
  const barArea = labels ? 26 : VIZ_HEIGHT - 8;
  return (
    <View testID="viz-bars" style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: barArea }}>
        {values.map((v, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
            key={i}
            style={{
              flex: 1,
              height: Math.max(4, (v / max) * barArea),
              borderRadius: 4,
              backgroundColor: i === accent ? vizAccent(theme) : theme.colors.fill,
            }}
          />
        ))}
      </View>
      {labels ? (
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {labels.map((l, i) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional
              key={i}
              variant="caption2"
              tone="secondary"
              align="center"
              numberOfLines={1}
              style={{ flex: 1, fontSize: 8, lineHeight: 10 }}
            >
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Spark({
  values,
  tone,
  fill,
  width,
}: Extract<GlanceViz, { kind: 'spark' }> & { width: number }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const h = VIZ_HEIGHT - 4;
  const line = sparkPath(values, width, h);
  const last = line.split(' L').pop()?.replace('M', '').split(' ').map(Number);
  return (
    <View testID="viz-spark">
      <Svg width={width} height={h}>
        {fill && line ? (
          <Path d={`${line} L${width - 3} ${h} L3 ${h} Z`} fill={color} fillOpacity={0.18} />
        ) : null}
        <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {last && last.length === 2 ? <Circle cx={last[0]} cy={last[1]} r={3} fill={color} /> : null}
      </Svg>
    </View>
  );
}

function Segments({ parts, legend }: Extract<GlanceViz, { kind: 'segments' }>) {
  const theme = useTheme();
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <View testID="viz-segments" style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          gap: 2,
          backgroundColor: theme.colors.fill,
        }}
      >
        {total > 0
          ? parts
              .filter((p) => p.value > 0)
              .map((p, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                  key={i}
                  style={{ flex: p.value, backgroundColor: toneColor(theme, p.tone) }}
                />
              ))
          : null}
      </View>
      {legend && legend.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {legend.map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  backgroundColor: toneColor(theme, l.tone),
                }}
              />
              <Text variant="caption2" tone="secondary" numberOfLines={1}>
                {l.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Pills({ total, filled }: Extract<GlanceViz, { kind: 'pills' }>) {
  const theme = useTheme();
  const count = Math.min(Math.max(total, filled), 8);
  return (
    <View testID="viz-pills" style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: pills are positional
          key={i}
          style={{
            flex: 1,
            height: 26,
            borderRadius: 9,
            backgroundColor: i < filled ? vizAccent(theme) : theme.colors.fill,
          }}
        />
      ))}
    </View>
  );
}

function Chips({ labels }: Extract<GlanceViz, { kind: 'chips' }>) {
  const theme = useTheme();
  return (
    <View testID="viz-chips" style={{ flexDirection: 'row', gap: 5 }}>
      {labels.map((l) => (
        <View
          key={l}
          style={{
            minWidth: 22,
            height: 22,
            paddingHorizontal: 4,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.fill,
          }}
        >
          <Text variant="caption2" weight="600" tone="secondary">
            {l}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Copy({ label, text, mono }: Extract<GlanceViz, { kind: 'copy' }>) {
  const theme = useTheme();
  return (
    <Pressable
      testID="viz-copy"
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      hitSlop={6}
      // The share sheet has Copy built in, so no clipboard module is needed.
      onPress={() => {
        haptics.light();
        void Share.share({ message: text }).catch(() => {});
      }}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        height: 24,
        borderRadius: 7,
        backgroundColor: theme.colors.fill,
      }}
    >
      <Text variant="caption1" mono={mono} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Icon name="copy" size={11} color={theme.colors.secondaryLabel} />
    </Pressable>
  );
}

function Rows({ rows }: Extract<GlanceViz, { kind: 'rows' }>) {
  return (
    <View testID="viz-rows" style={{ gap: 2 }}>
      {rows.map((r) => (
        <View key={r.left} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {r.left}
          </Text>
          <Text variant="footnote" mono>
            {r.right}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TextViz({ title, caption, time }: Extract<GlanceViz, { kind: 'text' }>) {
  return (
    <View testID="viz-text">
      {time ? (
        <Text variant="caption2" mono tone="secondary">
          {time}
        </Text>
      ) : null}
      <Text variant="footnote" weight="600" numberOfLines={2}>
        {title}
      </Text>
      {caption ? (
        <Text variant="caption1" tone="secondary" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** The one tiny visual at the bottom of a square tile. */
export function MiniViz({ viz, width }: { viz: GlanceViz; width: number }) {
  switch (viz.kind) {
    case 'days':
      return <Days {...viz} />;
    case 'bars':
      return <Bars {...viz} />;
    case 'spark':
      return <Spark {...viz} width={width} />;
    case 'segments':
      return <Segments {...viz} />;
    case 'pills':
      return <Pills {...viz} />;
    case 'chips':
      return <Chips {...viz} />;
    case 'copy':
      return <Copy {...viz} />;
    case 'rows':
      return <Rows {...viz} />;
    case 'text':
      return <TextViz {...viz} />;
    default: {
      const unhandled: never = viz;
      return unhandled;
    }
  }
}
