import { type AndroidSymbol, type SFSymbol, SymbolView, type SymbolWeight } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { useTheme } from '../theme/theme.js';

interface IconDef {
  ios: SFSymbol;
  material: AndroidSymbol;
}

// One app-level vocabulary so screens never name platform symbols directly.
const icons = {
  home: { ios: 'house.fill', material: 'home' },
  board: { ios: 'square.grid.2x2.fill', material: 'view_kanban' },
  capture: { ios: 'plus.circle.fill', material: 'add_circle' },
  ideas: { ios: 'lightbulb.fill', material: 'lightbulb' },
  more: { ios: 'ellipsis.circle', material: 'more_horiz' },
  analytics: { ios: 'chart.bar.fill', material: 'bar_chart' },
  wiki: { ios: 'book.fill', material: 'menu_book' },
  knowledge: { ios: 'brain', material: 'psychology' },
  files: { ios: 'folder.fill', material: 'folder' },
  repos: { ios: 'externaldrive.fill', material: 'database' },
  todo: { ios: 'checklist', material: 'checklist' },
  note: { ios: 'note.text', material: 'sticky_note_2' },
  log: { ios: 'clock', material: 'schedule' },
  chevronRight: { ios: 'chevron.right', material: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', material: 'expand_more' },
  check: { ios: 'checkmark', material: 'check' },
  close: { ios: 'xmark', material: 'close' },
  add: { ios: 'plus', material: 'add' },
  search: { ios: 'magnifyingglass', material: 'search' },
  settings: { ios: 'gearshape.fill', material: 'settings' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', material: 'logout' },
  trash: { ios: 'trash', material: 'delete' },
  edit: { ios: 'pencil', material: 'edit' },
  share: { ios: 'square.and.arrow.up', material: 'share' },
  sparkles: { ios: 'sparkles', material: 'auto_awesome' },
  calendar: { ios: 'calendar', material: 'calendar_today' },
  flag: { ios: 'flag.fill', material: 'flag' },
  star: { ios: 'star.fill', material: 'star' },
  info: { ios: 'info.circle', material: 'info' },
  warning: { ios: 'exclamationmark.triangle.fill', material: 'warning' },
  refresh: { ios: 'arrow.clockwise', material: 'refresh' },
  filter: { ios: 'line.3.horizontal.decrease', material: 'filter_list' },
  sort: { ios: 'arrow.up.arrow.down', material: 'sort' },
  empty: { ios: 'tray', material: 'inbox' },
  lock: { ios: 'lock.fill', material: 'lock' },
  unlock: { ios: 'lock.open', material: 'lock_open' },
  folder: { ios: 'folder', material: 'folder' },
  document: { ios: 'doc.text', material: 'description' },
  chevronLeft: { ios: 'chevron.left', material: 'chevron_left' },
  arrowBack: { ios: 'chevron.left', material: 'arrow_back' },
  globe: { ios: 'globe', material: 'public' },
  gauge: { ios: 'gauge.with.dots.needle.33percent', material: 'speed' },
  terminal: { ios: 'terminal', material: 'terminal' },
  chartLine: { ios: 'chart.line.uptrend.xyaxis', material: 'show_chart' },
  clock: { ios: 'clock', material: 'schedule' },
  timer: { ios: 'timer', material: 'timer' },
  bookmark: { ios: 'bookmark', material: 'bookmark' },
  wallet: { ios: 'creditcard', material: 'payments' },
  table: { ios: 'tablecells', material: 'table_chart' },
  prompt: { ios: 'text.bubble', material: 'chat' },
  list: { ios: 'list.bullet', material: 'format_list_bulleted' },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  /** iOS only; Material Symbols need a pre-bundled weight font. */
  weight?: SymbolWeight;
  /** Icons are decorative unless a label is given. */
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color, weight, accessibilityLabel }: IconProps) {
  const theme = useTheme();
  const def = icons[name];
  return (
    <SymbolView
      name={{ ios: def.ios, android: def.material, web: def.material }}
      size={size}
      tintColor={color ?? theme.colors.accent}
      weight={weight}
      type="monochrome"
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    />
  );
}
