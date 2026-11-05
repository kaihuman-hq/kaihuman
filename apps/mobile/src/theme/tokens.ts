/** Nexus / LifeOS dark terminal palette, mirrored from the console and the widget spec. */
export const colors = {
  background: '#0a0a0a',
  surface: '#111111',
  border: '#262626',
  text: '#e5e5e5',
  muted: '#737373',
  /** Brand neon green (`KAIHUMAN // TODOS` header). */
  accent: '#39ff14',
  /** In-progress `[>]` marker. */
  info: '#22d3ee',
  danger: '#f87171',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const typography = {
  mono: 'Menlo',
  sizes: { caption: 11, body: 14, title: 18 },
} as const;

export const theme = { colors, spacing, typography } as const;
export type Theme = typeof theme;
