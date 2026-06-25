import { Input as CascivoInputImport } from '@cascivo/react';
import type { h } from 'preact';

// Cascivo ships React prop types; alias to a Preact-typed signature to bridge
// the JSX type systems (same pattern as the Radix wrappers in this package).
const CascivoInput = CascivoInputImport as unknown as (
  props: Record<string, unknown>,
) => h.JSX.Element;

// Omit `size`: Cascivo's Input takes a `'sm' | 'md' | 'lg'` size prop, which
// collides with HTML's numeric `size` attribute.
export interface InputProps extends Omit<h.JSX.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  type?: string;
  /** `true` toggles the error state; a string also supplies Cascivo's message. */
  error?: boolean | string;
}

export const Input = ({ error, ...props }: InputProps) => (
  <CascivoInput
    error={typeof error === 'string' ? error : undefined}
    aria-invalid={error ? true : undefined}
    {...props}
  />
);
