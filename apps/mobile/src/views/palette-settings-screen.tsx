import { useEffect, useState } from 'react';
import { presentTile } from '../components/widgets/tile-controllers.js';
import type { TileFile } from '../screens/dashboards.js';
import { EmptyState, Screen } from '../ui/index.js';
import { Tile } from './tile-view.js';

export interface PaletteSettingsScreenProps {
  load: () => Promise<TileFile | null>;
  onWrite: (path: string, content: string) => Promise<void>;
  now?: Date;
}

type State =
  | { state: 'loading' }
  | { state: 'absent' | 'error'; message?: string }
  | { state: 'ready'; file: TileFile };

/** More → Settings → Command palette: the palette settings file in its tile editor. */
export function PaletteSettingsScreen({
  load,
  onWrite,
  now = new Date(),
}: PaletteSettingsScreenProps) {
  const [s, setS] = useState<State>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    load()
      .then((file) => live && setS(file ? { state: 'ready', file } : { state: 'absent' }))
      .catch(
        (e: unknown) =>
          live && setS({ state: 'error', message: e instanceof Error ? e.message : undefined }),
      );
    return () => {
      live = false;
    };
  }, [load]);

  const tile = s.state === 'ready' ? presentTile(s.file.path, s.file.content, now) : undefined;
  return (
    <Screen title="Command palette">
      {s.state === 'ready' && tile ? (
        <Tile
          path={s.file.path}
          tile={tile}
          content={s.file.content}
          now={now}
          onWrite={async (path, content) => {
            setS({ state: 'ready', file: { path, content } });
            await onWrite(path, content);
          }}
        />
      ) : s.state === 'absent' ? (
        <EmptyState
          icon="terminal"
          title="No palette settings"
          message="Add command-palette.settings.json to your repository from the console to configure the palette."
        />
      ) : s.state === 'error' ? (
        <EmptyState
          icon="warning"
          title="Could not load settings"
          {...(s.message && { message: s.message })}
        />
      ) : null}
    </Screen>
  );
}
