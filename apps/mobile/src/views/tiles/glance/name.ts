import { TILE_EXTENSIONS } from '../../../components/widgets/tile-controllers.js';

/** `.kh/coffee.consumption.csv` → `Coffee`, `deep-work.timetracking.csv` → `Deep work`. */
export const tileTitle = (path: string, fallback: string): string => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const suffix = TILE_EXTENSIONS.find((s) => base.endsWith(s));
  const stem = (suffix ? base.slice(0, -suffix.length) : base).replace(/[-_.]+/g, ' ').trim();
  if (!stem) return fallback;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
};
