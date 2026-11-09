import { Pressable, View } from 'react-native';
import type { TileView } from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Card, Text } from '../../ui/index.js';
import { TILE_META } from '../tile-view.js';
import { TileIcon } from './parts.js';
import { summarizeTile } from './summary.js';

export const tileRoute = (path: string) => `/dashboard/tile?path=${encodeURIComponent(path)}`;

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function SeeAll({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, spacing, metrics, platform } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`See all ${title}`}
      onPress={onPress}
      hitSlop={8}
      android_ripple={platform === 'ios' ? undefined : { color: colors.pressed }}
      style={({ pressed }) => ({
        minHeight: metrics.hitTarget,
        justifyContent: 'center',
        marginTop: spacing.xs,
        opacity: pressed && platform === 'ios' ? 0.6 : 1,
      })}
    >
      <Text variant="subheadline" weight="600" color={colors.accent}>
        See all
      </Text>
    </Pressable>
  );
}

/** Glanceable card: one big number and up to three lines, with the full tile one tap away. */
export function SummaryTile({
  path,
  tile,
  now,
  onSeeAll,
}: {
  path: string;
  tile: TileView;
  now: Date;
  onSeeAll: () => void;
}) {
  const { spacing } = useTheme();
  const meta = TILE_META[tile.kind];
  const { stat, statLabel, items } = summarizeTile(tile, now);
  return (
    <Card>
      <View testID={`summary-${tile.kind}`} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TileIcon name={meta.icon} />
          <Text variant="headline" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
            {meta.title}
          </Text>
        </View>
        <View>
          <Text variant="title1" mono numberOfLines={1}>
            {stat}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {statLabel}
          </Text>
        </View>
        {items.map((line) => (
          <Text key={line} variant="subheadline" tone="secondary" numberOfLines={1}>
            {line}
          </Text>
        ))}
        <SeeAll title={meta.title} onPress={onSeeAll} />
        <Text variant="caption2" mono tone="secondary" numberOfLines={1}>
          {nameOf(path)}
        </Text>
      </View>
    </Card>
  );
}

/** Files the console renders but the app has no tile for yet. */
export function UnsupportedTile({ path, onOpen }: { path: string; onOpen: () => void }) {
  const { colors, spacing, metrics, platform } = useTheme();
  return (
    <Card>
      <View testID="tile-unsupported" style={{ gap: spacing.sm }}>
        <Text variant="subheadline" mono numberOfLines={1}>
          {nameOf(path)}
        </Text>
        <Text variant="footnote" tone="secondary">
          This tile is only available in the web console.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open file ${nameOf(path)}`}
          onPress={onOpen}
          android_ripple={platform === 'ios' ? undefined : { color: colors.pressed }}
          style={{ minHeight: metrics.hitTarget, justifyContent: 'center' }}
        >
          <Text variant="subheadline" weight="600" color={colors.accent}>
            Open file
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
