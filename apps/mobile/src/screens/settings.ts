import { tileKindForPath } from '../components/widgets/tile-controllers.js';
import type { TileFile } from './dashboards.js';
import type { ContentFiles } from './file-editor-screen.js';

/**
 * The command palette settings file (`command-palette.settings.json`), or null when the repository
 * has none. It used to be a dashboard tile; it now lives in More → Settings (README decision 7).
 */
export async function loadPaletteSettings(
  files: Pick<ContentFiles, 'tree' | 'refresh' | 'read'>,
): Promise<TileFile | null> {
  const find = () =>
    files.tree().find((t) => t.type === 'blob' && tileKindForPath(t.path) === 'palettesettings');
  // A cold start has no tree yet; one refresh fills it.
  const item = find() ?? (await files.refresh().then(find));
  return item ? { path: item.path, content: await files.read(item.path) } : null;
}
