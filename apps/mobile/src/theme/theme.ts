import { Platform, type TextStyle, useColorScheme } from 'react-native';

/**
 * kaihuman native design tokens. Brand colours come from the logo (Volt on Ink, see
 * apps/console/public/logo.svg); everything else follows iOS HIG or Material 3 so the
 * app feels native. See doc/mobile-design.md.
 */

export type ColorScheme = 'light' | 'dark';
export type DesignPlatform = 'ios' | 'android';

export const brand = {
  /** Logo yellow-green. Fill colour in dark mode, text colour on Ink in light mode. */
  volt: '#E6FF4A',
  /** Logo background. */
  ink: '#0C0D0C',
  /** Volt darkened for ≥7:1 text contrast on light surfaces. */
  olive: '#4F5E00',
} as const;

export interface Palette {
  /** Screen background (grouped background on iOS). */
  background: string;
  /** Cards, list sections, sheets. */
  surface: string;
  /** Raised surfaces on top of `surface` (menus, pressed rows, chips). */
  surfaceElevated: string;
  /** Control fills: text fields, segmented control track, neutral chips. */
  fill: string;
  separator: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  /** Tint for text, icons, links and the selected tab. */
  accent: string;
  /** Background of filled (primary) buttons and the FAB. */
  accentFill: string;
  onAccentFill: string;
  /** Background of tinted buttons, selected chips, badges. */
  accentSoft: string;
  onAccentSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Android ripple / iOS pressed overlay. */
  pressed: string;
  /** Glyphs on a status-coloured icon tile (dark on the bright dark-mode hues). */
  onStatus: string;
  /** Text and icons on a `danger` fill. */
  onDanger: string;
  /** Shadow colour for raised items on light surfaces. */
  shadow: string;
}

const iosDark: Palette = {
  background: '#0B0C0A',
  surface: '#1B1C19',
  surfaceElevated: '#262723',
  fill: 'rgba(120,120,128,0.24)',
  separator: 'rgba(84,84,88,0.65)',
  label: '#F4F5EF',
  secondaryLabel: 'rgba(235,235,245,0.62)',
  tertiaryLabel: 'rgba(235,235,245,0.32)',
  accent: brand.volt,
  accentFill: brand.volt,
  onAccentFill: brand.ink,
  accentSoft: 'rgba(230,255,74,0.16)',
  onAccentSoft: brand.volt,
  success: '#32D74B',
  warning: '#FFD60A',
  danger: '#FF453A',
  info: '#64D2FF',
  pressed: 'rgba(255,255,255,0.08)',
  onStatus: '#0B0C0A',
  onDanger: '#FFFFFF',
  shadow: '#000000',
};

const iosLight: Palette = {
  background: '#F3F3EF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  fill: 'rgba(118,118,128,0.12)',
  separator: 'rgba(60,60,67,0.29)',
  label: brand.ink,
  secondaryLabel: 'rgba(60,60,67,0.76)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  accent: brand.olive,
  accentFill: brand.ink,
  onAccentFill: brand.volt,
  accentSoft: 'rgba(79,94,0,0.12)',
  onAccentSoft: brand.olive,
  success: '#248A3D',
  warning: '#B25000',
  danger: '#D70015',
  info: '#0071A4',
  pressed: 'rgba(0,0,0,0.06)',
  onStatus: '#FFFFFF',
  onDanger: '#FFFFFF',
  shadow: '#000000',
};

// Material 3 tonal surfaces generated around the Volt seed.
const androidDark: Palette = {
  ...iosDark,
  background: '#12130F',
  surface: '#1E1F1A',
  surfaceElevated: '#292A24',
  fill: '#33352E',
  separator: '#45483C',
  label: '#E4E3DB',
  secondaryLabel: '#C6C8B8',
  tertiaryLabel: '#8F9284',
  onAccentFill: '#2C3400',
  accentSoft: '#414C00',
  onAccentSoft: brand.volt,
  pressed: 'rgba(230,255,74,0.12)',
};

const androidLight: Palette = {
  ...iosLight,
  background: '#FBFBF2',
  surface: '#F0F1E6',
  surfaceElevated: '#FFFFFF',
  fill: '#E4E4DA',
  separator: '#C6C8B8',
  label: '#1B1C17',
  secondaryLabel: '#46483C',
  tertiaryLabel: '#6A6C60',
  accentSoft: '#DCEB8C',
  onAccentSoft: '#181E00',
  pressed: 'rgba(79,94,0,0.12)',
};

export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2';

type TypeStyle = Required<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>> &
  Pick<TextStyle, 'letterSpacing'>;

// iOS: Apple's default Dynamic Type sizes (Large).
const iosType: Record<TextVariant, TypeStyle> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.4 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.38 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.26 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.45 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.43 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.31 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.23 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400', letterSpacing: 0.06 },
};

// Android: Material 3 type scale mapped onto the same semantic names.
const androidType: Record<TextVariant, TypeStyle> = {
  largeTitle: { fontSize: 32, lineHeight: 40, fontWeight: '400', letterSpacing: 0 },
  title1: { fontSize: 28, lineHeight: 36, fontWeight: '400', letterSpacing: 0 },
  title2: { fontSize: 24, lineHeight: 32, fontWeight: '400', letterSpacing: 0 },
  title3: { fontSize: 22, lineHeight: 28, fontWeight: '400', letterSpacing: 0 },
  headline: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: 0.15 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0.5 },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0.25 },
  subheadline: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0.25 },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0.4 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
  caption2: { fontSize: 11, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
};

/** System font: SF Pro on iOS, Roboto on Android; a close stack for the web preview. */
export const fontFamily = {
  system: Platform.select<string | undefined>({
    web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Inter, system-ui, sans-serif',
    default: undefined,
  }),
  /** Brand carry-over from the console terminal look: numbers, paths, code. */
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
  }),
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export interface Shape {
  /** Chips, small controls. */
  sm: number;
  /** Grouped list sections, text fields. */
  md: number;
  /** Cards, sheets. */
  lg: number;
  /** Filled/tinted buttons. */
  button: number;
  pill: number;
}

export interface Metrics {
  /** Minimum touch target: 44pt (HIG) / 48dp (Material). */
  hitTarget: number;
  /** Minimum list row height. */
  rowHeight: number;
  /** Large button height. */
  buttonHeight: number;
  /** Horizontal screen margin. */
  screenMargin: number;
  /** Leading inset of row separators (icon + gap) on iOS. */
  separatorInset: number;
}

export interface Theme {
  platform: DesignPlatform;
  scheme: ColorScheme;
  colors: Palette;
  type: Record<TextVariant, TypeStyle>;
  fontFamily: typeof fontFamily;
  spacing: typeof spacing;
  shape: Shape;
  metrics: Metrics;
}

const shapes: Record<DesignPlatform, Shape> = {
  ios: { sm: 8, md: 10, lg: 14, button: 12, pill: 999 },
  android: { sm: 8, md: 12, lg: 16, button: 999, pill: 999 },
};

const metrics: Record<DesignPlatform, Metrics> = {
  ios: { hitTarget: 44, rowHeight: 44, buttonHeight: 50, screenMargin: 16, separatorInset: 16 },
  android: { hitTarget: 48, rowHeight: 56, buttonHeight: 48, screenMargin: 16, separatorInset: 0 },
};

const palettes: Record<DesignPlatform, Record<ColorScheme, Palette>> = {
  ios: { light: iosLight, dark: iosDark },
  android: { light: androidLight, dark: androidDark },
};

export function makeTheme(scheme: ColorScheme, platform: DesignPlatform): Theme {
  return {
    platform,
    scheme,
    colors: palettes[platform][scheme],
    type: platform === 'ios' ? iosType : androidType,
    fontFamily,
    spacing,
    shape: shapes[platform],
    metrics: metrics[platform],
  };
}

const themes: Record<DesignPlatform, Record<ColorScheme, Theme>> = {
  ios: { light: makeTheme('light', 'ios'), dark: makeTheme('dark', 'ios') },
  android: { light: makeTheme('light', 'android'), dark: makeTheme('dark', 'android') },
};

/**
 * Native platforms use their own conventions. The web build is a design preview, so it
 * shows iOS unless `?platform=android` is in the URL.
 */
export function designPlatform(): DesignPlatform {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  return /[?&]platform=android\b/.test(search) ? 'android' : 'ios';
}

/** Follows the system light/dark setting; dark when the system reports none. */
export function useTheme(): Theme {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return themes[designPlatform()][scheme];
}
