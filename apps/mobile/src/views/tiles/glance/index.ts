import type { TileView } from '../../../components/widgets/tile-controllers.js';
import {
  boardGlance,
  bookmarksGlance,
  clocksGlance,
  commandsGlance,
  eventsGlance,
  logGlance,
  promptsGlance,
  readLaterGlance,
  rssGlance,
  todosGlance,
  travelGlance,
} from './lists.js';
import {
  budgetGlance,
  collectionGlance,
  consumptionGlance,
  habitGlance,
  stocksGlance,
  timerGlance,
} from './trackers.js';
import type { Glance, GlanceInput } from './types.js';

export { tileTitle } from './name.js';
export type * from './types.js';

/** The square tile for a presented file; null for kinds that are not glance tiles (palette settings live in More → Settings). */
export function glanceOf(input: GlanceInput, tile: TileView): Glance | null {
  switch (tile.kind) {
    case 'todos':
      return todosGlance(input, tile.view);
    case 'habit':
      return habitGlance(input, tile.view);
    case 'timetracking':
      return timerGlance(input, tile.view);
    case 'events':
      return eventsGlance(input, tile.view);
    case 'actionlog':
      return logGlance(input, tile.view);
    case 'timezones':
      return clocksGlance(input, tile.view);
    case 'readitlater':
      return readLaterGlance(input, tile.view);
    case 'bookmarks':
      return bookmarksGlance(input, tile.view);
    case 'budget':
      return budgetGlance(input, tile.view);
    case 'stocks':
      return stocksGlance(input, tile.view);
    case 'consumption':
      return consumptionGlance(input, tile.view);
    case 'datacollection':
      return collectionGlance(input, tile.view);
    case 'prompts':
      return promptsGlance(input, tile.view);
    case 'commands':
      return commandsGlance(input, tile.view);
    case 'rss':
      return rssGlance(input, tile.view);
    case 'travel':
      return travelGlance(input, tile.view);
    case 'boardoverview':
      return boardGlance(input, tile.view);
    case 'palettesettings':
      return null;
    default: {
      const unhandled: never = tile;
      return unhandled;
    }
  }
}
