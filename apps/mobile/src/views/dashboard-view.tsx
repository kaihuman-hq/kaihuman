import { presentTile } from '../components/widgets/tile-controllers.js';
import { Button, Muted, Screen, Title } from './primitives.js';
import { Tile } from './tile-view.js';

export interface TileFile {
  path: string;
  content: string;
}

export const DASHBOARD_LINKS = [
  ['Quick todo', '/quick-todo'],
  ['Board', '/board'],
  ['Analytics', '/analytics'],
  ['Ideas', '/ideas'],
  ['Wiki', '/wiki'],
  ['Knowledge', '/knowledge'],
  ['Files', '/files'],
  ['Repos', '/repos'],
] as const;

export function DashboardView({
  tiles,
  now,
  loading = false,
  onWrite,
  onNavigate,
}: {
  tiles: TileFile[];
  now: Date;
  loading?: boolean;
  onWrite: (path: string, content: string) => void | Promise<void>;
  onNavigate: (href: string) => void;
}) {
  const shown = tiles.flatMap((f) => {
    const tile = presentTile(f.path, f.content, now);
    return tile ? [{ ...f, tile }] : [];
  });
  return (
    <Screen scroll>
      <Title>Dashboard</Title>
      {DASHBOARD_LINKS.map(([label, href]) => (
        <Button key={href} label={label} testID={`nav-${href}`} onPress={() => onNavigate(href)} />
      ))}
      {loading && <Muted>Loading...</Muted>}
      {!loading && shown.length === 0 && <Muted>No dashboard files in this repository</Muted>}
      {shown.map((f) => (
        <Tile
          key={f.path}
          path={f.path}
          tile={f.tile}
          content={f.content}
          now={now}
          onWrite={onWrite}
        />
      ))}
    </Screen>
  );
}
