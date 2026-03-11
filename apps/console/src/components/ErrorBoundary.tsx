import { Logger } from '@lifosy/core';
import { AlertTriangle, RefreshCw } from 'lucide-preact';
import { Component, type ComponentChildren, h } from 'preact';

const logger = new Logger('ErrorBoundary');

interface Props {
  children: ComponentChildren;
  fallback?: ComponentChildren;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    logger.error(`Error in ${this.props.componentName || 'Component'}:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-[var(--los-bg)] text-[var(--los-fg)] border border-[var(--los-border)] border-dashed rounded-md">
          <div className="bg-red-500/10 p-4 rounded-full mb-4 text-red-500 border border-red-500/20">
            <AlertTriangle size={32} />
          </div>
          <h3 className="text-lg font-mono font-bold text-red-500 mb-2">Something went wrong</h3>
          <p className="font-mono text-[var(--los-muted)] mb-6 max-w-md text-sm">
            {this.props.componentName
              ? `The ${this.props.componentName} component encountered an error.`
              : 'An unexpected error occurred.'}
          </p>

          <div className="bg-black/30 p-4 rounded-md w-full max-w-lg overflow-auto max-h-48 mb-6 text-left border border-[var(--los-border)]">
            <code className="text-xs font-mono text-red-400 whitespace-pre-wrap break-all">
              {this.state.error?.toString()}
            </code>
          </div>

          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--los-accent)] text-black rounded-sm font-mono text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={16} />
            TRY AGAIN
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
