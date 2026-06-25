import type { h } from 'preact';
import { CascivoInput } from './cascivo/input';

export interface InputProps extends Omit<h.JSX.HTMLAttributes<HTMLInputElement>, 'size'> {
  type?: string;
  /** `true` toggles the error state; a string also supplies the message. */
  error?: boolean | string;
}

export const Input = ({ error, ...props }: InputProps) => (
  <CascivoInput error={typeof error === 'string' ? error : undefined} {...props} />
);
