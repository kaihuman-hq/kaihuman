import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './button.js';
import { Card } from './card.js';
import { Text } from './text.js';

export interface InlineErrorProps {
  /** What failed, e.g. "this tile"; read as "Couldn't show this tile". */
  what: string;
  message: string;
  onRetry?: () => void;
}

/** The card a failed file view or tile shows in its place, so the rest of the screen still works. */
export function InlineError({ what, message, onRetry }: InlineErrorProps) {
  return (
    <Card title={`Couldn't show ${what}`} icon="warning">
      <Text tone="secondary" testID="inline-error" numberOfLines={4}>
        {message}
      </Text>
      {onRetry ? <Button label="Retry" size="small" variant="tinted" onPress={onRetry} /> : null}
    </Card>
  );
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  what: string;
  /** A change here (e.g. new file text) clears the error and renders the children again. */
  resetKey?: unknown;
  /** Runs before a retry, e.g. to reload the data the view failed on. */
  onRetry?: () => void;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message || e.name : String(e);

/**
 * Catches a render error in one view. React has no hook for this, so it is a class.
 * Without it a single bad file unmounts the whole tree and, in a release build, closes the app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey)
      ? null
      : { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`View failed: ${this.props.what}`, error, info.componentStack);
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (error)
      return (
        <InlineError what={this.props.what} message={errorMessage(error)} onRetry={this.retry} />
      );
    return this.props.children;
  }
}
