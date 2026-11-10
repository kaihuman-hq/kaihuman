import type { Theme } from '../../../theme/theme.js';
import type { GlanceTint, GlanceTone } from '../glance/types.js';

const PURPLE = { light: '#8944AB', dark: '#BF5AF2' } as const;
const CATS = {
  light: ['#248A3D', '#0071A4', '#8944AB', '#B25000'],
  dark: ['#32D74B', '#64D2FF', '#BF5AF2', '#FFD60A'],
} as const;

/** Bright Volt reads on Ink, but on light surfaces the cells need a darker lime to keep contrast. */
export const vizAccent = (theme: Theme): string =>
  theme.scheme === 'dark' ? '#E6FF4A' : '#C3D900';

export function toneColor(theme: Theme, tone: GlanceTone): string {
  const { colors, scheme } = theme;
  switch (tone) {
    case 'accent':
      return vizAccent(theme);
    case 'info':
      return colors.info;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
    case 'muted':
      return colors.fill;
    case 'label':
      return colors.label;
    case 'cat1':
      return CATS[scheme][0];
    case 'cat2':
      return CATS[scheme][1];
    case 'cat3':
      return CATS[scheme][2];
    case 'cat4':
      return CATS[scheme][3];
    default: {
      const unhandled: never = tone;
      return unhandled;
    }
  }
}

/** `#RRGGBB` plus alpha; other formats pass through (they already carry their own alpha). */
export const withAlpha = (hex: string, alpha: number): string =>
  /^#[0-9a-f]{6}$/i.test(hex)
    ? `${hex}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`
    : hex;

export function tintColors(theme: Theme, tint: GlanceTint): { fg: string; bg: string } {
  const { colors, scheme } = theme;
  const fg = {
    olive: colors.accent,
    orange: colors.warning,
    blue: colors.info,
    red: colors.danger,
    green: colors.success,
    purple: PURPLE[scheme],
    yellow: scheme === 'dark' ? colors.warning : '#9A6B00',
  }[tint];
  return { fg, bg: tint === 'olive' ? colors.accentSoft : withAlpha(fg, 0.16) };
}
