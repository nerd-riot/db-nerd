import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  tableName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class DataGridErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DataGridErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 text-slate-200 select-none font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center ring-1 ring-amber-500/10">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3.5 shadow-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 mb-1">
              Data Grid Render Error
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              An unexpected render issue occurred while rendering{' '}
              <span className="font-semibold text-sky-400 font-mono">
                {this.props.tableName || 'table'}
              </span>
              . The grid canvas was protected from crashing.
            </p>
            {this.state.error?.message && (
              <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 mb-4 text-[11px] font-mono text-amber-300 text-left overflow-auto max-h-32 break-all leading-relaxed">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-sky-600/20 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Table View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
