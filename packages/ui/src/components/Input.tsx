import { Input as CascivoInputImport } from '@cascivo/react';
import type { h } from 'preact';
import { forwardRef } from 'preact/compat';

// Cascivo ships React prop types; alias to a Preact-typed signature to bridge
// the JSX type systems (same pattern as the Radix wrappers in this package).
const CascivoInput = CascivoInputImport as unknown as (
  props: Record<string, unknown>,
) => h.JSX.Element;

export interface InputProps extends h.JSX.HTMLAttributes<HTMLInputElement> {
  type?: string;
  /** `true` toggles the error state; a string also supplies Cascivo's message. */
  error?: boolean | string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ error, ...props }, ref) => (
  <CascivoInput
    ref={ref}
    error={typeof error === 'string' ? error : undefined}
    aria-invalid={error ? true : undefined}
    {...props}
  />
));
Input.displayName = 'Input';
