import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackTitle || 'Panel'}:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <div className="w-10 h-10 rounded surface-bezel flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-status-error" />
          </div>
          <div>
            <p className="text-xs font-mono font-semibold text-label-primary">
              {this.props.fallbackTitle || 'Panel'} Error
            </p>
            <p className="text-[10px] text-label-muted mt-1 max-w-xs">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="control-button flex items-center gap-1.5 text-[10px]"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
