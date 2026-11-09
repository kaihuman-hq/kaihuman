import { useState } from 'react';
import { View } from 'react-native';
import type {
  TileView as TileData,
  TileKind,
  TileResult,
} from '../components/widgets/tile-controllers.js';
import { useTheme } from '../theme/theme.js';
import type { IconName } from '../ui/index.js';
import { Badge, Card, ErrorBoundary, Text } from '../ui/index.js';
import {
  ActionLog,
  Bookmarks,
  Budget,
  Clocks,
  Collection,
  Consumption,
  type Ctx,
  Events,
  Habit,
  ReadLater,
  Templates,
  Timer,
  Todos,
} from './tiles/bodies.js';
import { BoardOverview, PaletteSettings, Rss, Travel } from './tiles/more-bodies.js';
import { Err, TileIcon } from './tiles/parts.js';
import { Stocks } from './tiles/tracker-bodies.js';

export interface TileProps {
  path: string;
  tile: TileData;
  /** The file's current text; actions compute the next text from it. */
  content: string;
  now: Date;
  /** Persists the file's new text. */
  onWrite: (path: string, content: string) => void | Promise<void>;
}

/** Friendly heading and glyph per tile kind; the file name stays as a mono caption. */
export const TILE_META: Record<TileKind, { title: string; icon: IconName }> = {
  todos: { title: 'Todos', icon: 'todo' },
  habit: { title: 'Habit', icon: 'flag' },
  timetracking: { title: 'Time tracking', icon: 'timer' },
  events: { title: 'Events', icon: 'calendar' },
  actionlog: { title: 'Action log', icon: 'list' },
  timezones: { title: 'World clocks', icon: 'globe' },
  readitlater: { title: 'Read it later', icon: 'bookmark' },
  bookmarks: { title: 'Bookmarks', icon: 'star' },
  budget: { title: 'Budget', icon: 'wallet' },
  stocks: { title: 'Stocks', icon: 'chartLine' },
  consumption: { title: 'Consumption', icon: 'gauge' },
  datacollection: { title: 'Data collection', icon: 'table' },
  prompts: { title: 'Prompts', icon: 'prompt' },
  commands: { title: 'Commands', icon: 'terminal' },
  rss: { title: 'RSS feeds', icon: 'rss' },
  travel: { title: 'Travel', icon: 'travel' },
  boardoverview: { title: 'Board overview', icon: 'board' },
  palettesettings: { title: 'Palette settings', icon: 'settings' },
};

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function HeaderBadge({ tile }: { tile: TileData }) {
  if (tile.kind === 'todos') return <Badge label={`${tile.view.openCount} open`} />;
  if (tile.kind === 'timetracking' && tile.view.state === 'running')
    return <Badge tone="success" label="Running" />;
  if (tile.kind === 'datacollection')
    return <Badge tone="neutral" label={`${tile.view.rowCount} rows`} />;
  return null;
}

/** One dashboard tile: a card with a heading and a body per tile kind. A body that throws shows an inline error. */
export function Tile(props: TileProps) {
  return (
    <ErrorBoundary what="this tile" resetKey={props.content}>
      <TileCard {...props} />
    </ErrorBoundary>
  );
}

function TileCard({ path, tile, content, now, onWrite }: TileProps) {
  const [error, setError] = useState<string | null>(null);
  const { spacing } = useTheme();
  const meta = TILE_META[tile.kind];
  // Returns whether the write went through, so bodies only fire success feedback then.
  const apply = (result: string | TileResult): boolean => {
    if (typeof result === 'string') {
      setError(null);
      void onWrite(path, result);
      return true;
    }
    if (result.ok) {
      setError(null);
      void onWrite(path, result.content);
      return true;
    }
    setError(result.error);
    return false;
  };
  const ctx: Ctx = { content, now, apply, error };
  return (
    <Card>
      <View testID={`tile-${tile.kind}`} style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TileIcon name={meta.icon} />
          <View style={{ flex: 1 }}>
            <Text variant="headline" accessibilityRole="header">
              {meta.title}
            </Text>
            <Text variant="caption2" mono tone="secondary" numberOfLines={1}>
              {nameOf(path)}
            </Text>
          </View>
          <HeaderBadge tile={tile} />
        </View>
        <TileBody tile={tile} ctx={ctx} />
        <Err error={error} />
      </View>
    </Card>
  );
}

function TileBody({ tile, ctx }: { tile: TileData; ctx: Ctx }) {
  switch (tile.kind) {
    case 'todos':
      return <Todos view={tile.view} ctx={ctx} />;
    case 'habit':
      return <Habit view={tile.view} ctx={ctx} />;
    case 'timetracking':
      return <Timer view={tile.view} ctx={ctx} />;
    case 'events':
      return <Events rows={tile.view} ctx={ctx} />;
    case 'actionlog':
      return <ActionLog view={tile.view} ctx={ctx} />;
    case 'timezones':
      return <Clocks clocks={tile.view} />;
    case 'readitlater':
      return <ReadLater view={tile.view} ctx={ctx} />;
    case 'bookmarks':
      return <Bookmarks initial={tile.view} ctx={ctx} />;
    case 'budget':
      return <Budget view={tile.view} />;
    case 'stocks':
      return <Stocks view={tile.view} ctx={ctx} />;
    case 'consumption':
      return <Consumption meters={tile.view} />;
    case 'datacollection':
      return <Collection view={tile.view} />;
    case 'prompts':
      return <Templates view={tile.view} ctx={ctx} kind="prompt" />;
    case 'commands':
      return <Templates view={tile.view} ctx={ctx} kind="command" />;
    case 'rss':
      return <Rss view={tile.view} ctx={ctx} />;
    case 'travel':
      return <Travel view={tile.view} ctx={ctx} />;
    case 'boardoverview':
      return <BoardOverview view={tile.view} ctx={ctx} />;
    case 'palettesettings':
      return <PaletteSettings view={tile.view} />;
    default: {
      const unhandled: never = tile;
      return unhandled;
    }
  }
}
