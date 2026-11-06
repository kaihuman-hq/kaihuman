import type { ReactNode } from 'react';
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';
import { type TextVariant, useTheme } from '../theme/theme.js';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'danger'
  | 'success'
  | 'onAccent';

export interface TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Explicit colour, for text on custom backgrounds; wins over `tone`. */
  color?: string;
  mono?: boolean;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
  accessibilityRole?: 'header' | 'link' | 'text' | 'summary';
  testID?: string;
}

// Large headings would overflow the screen at the biggest accessibility sizes.
const capped: ReadonlySet<TextVariant> = new Set(['largeTitle', 'title1', 'title2', 'title3']);

export function Text({
  variant = 'body',
  tone = 'primary',
  color,
  mono,
  weight,
  align,
  numberOfLines,
  children,
  style,
  accessibilityRole,
  testID,
}: TextProps) {
  const theme = useTheme();
  const c = theme.colors;
  const tones: Record<TextTone, string> = {
    primary: c.label,
    secondary: c.secondaryLabel,
    tertiary: c.tertiaryLabel,
    accent: c.accent,
    danger: c.danger,
    success: c.success,
    onAccent: c.onAccentFill,
  };
  return (
    <RNText
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={capped.has(variant) ? 1.6 : undefined}
      testID={testID}
      style={[
        theme.type[variant],
        {
          color: color ?? tones[tone],
          fontFamily: mono ? theme.fontFamily.mono : theme.fontFamily.system,
        },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
