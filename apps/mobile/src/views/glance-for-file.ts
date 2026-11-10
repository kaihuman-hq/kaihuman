import { presentTile } from '../components/widgets/tile-controllers.js';
import type { TileFile } from '../screens/dashboards.js';
import { type Glance, glanceOf } from './tiles/glance/index.js';

/** The square-tile glance of a dashboard file, or null when the file is not a glance tile. */
export function glanceForFile(file: TileFile, now: Date): Glance | null {
  const tile = presentTile(file.path, file.content, now);
  return tile ? glanceOf({ path: file.path, content: file.content, now }, tile) : null;
}
