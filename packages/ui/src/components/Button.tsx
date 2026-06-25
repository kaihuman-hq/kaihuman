import { Button as CascivoButtonImport } from '@cascivo/react';
import type { h } from 'preact';

// Cascivo ships React prop types; alias to a Preact-typed signature to bridge
// the JSX type systems (same pattern as the Radix wrappers in this package).
const CascivoButton = CascivoButtonImport as unknown as (
  props: Record<string, unknown>,
) => h.JSX.Element;

export interface ButtonProps extends h.JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  /** Convenience alias for text content. */
  label?: string;
}

// Map this package's API onto Cascivo's Button. The extra `outline`/`danger`
// variants and `icon` size (kept for API compatibility) fold onto the nearest
// Cascivo equivalent.
const VARIANT_MAP = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  outline: 'ghost',
  danger: 'destructive',
} as const;

const SIZE_MAP = { sm: 'sm', md: 'md', lg: 'lg', icon: 'md' } as const;

export const Button = ({
  variant = 'primary',
  size = 'md',
  label,
  children,
  ...props
}: ButtonProps) => (
  <CascivoButton variant={VARIANT_MAP[variant]} size={SIZE_MAP[size]} {...props}>
    {label ?? children}
  </CascivoButton>
);
