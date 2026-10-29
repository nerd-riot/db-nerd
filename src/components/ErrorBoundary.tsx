import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React component tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetWorkspace = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith('dbnerd_session_tabs_')) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {}
    window.location.reload();
  };

  private handleCopyDetails = () => {
    const details = `DBNerd Error Report:\nError: ${this.state.error?.message || 'Unknown error'}\nStack: ${this.state.error?.stack || ''}\nComponent Stack: ${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard?.writeText(details);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-slate-100 p-6 select-none font-sans">
          <div className="max-w-xl w-full bg-slate-900/90 border border-red-500/30 rounded-xl shadow-2xl p-6 flex flex-col items-center text-center backdrop-blur-md">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <h1 className="text-lg font-semibold text-slate-100 mb-1">
              Application Error Encountered
            </h1>
            <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
              DBNerd encountered an unexpected issue while rendering the interface. You can reload the application or reset cached workspace state below.
            </p>

            {this.state.error && (
              <div className="w-full text-left bg-slate-950/80 border border-slate-800 rounded-lg p-3 mb-5 max-h-40 overflow-y-auto font-mono text-[11px] text-red-300">
                <div className="font-semibold text-red-400 mb-1">{this.state.error.name}: {this.state.error.message}</div>
                {this.state.error.stack && (
                  <pre className="text-slate-500 text-[10px] whitespace-pre-wrap break-all mt-1">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center space-x-3 w-full justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>

              <Tooltip side="top" content="Clears saved session tabs and reloads">
                <button
                  type="button"
                  onClick={this.handleResetWorkspace}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-xs rounded-lg transition active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset Workspace</span>
                </button>
              </Tooltip>

              <Tooltip side="top" content="Copy error details to clipboard">
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-xs rounded-lg transition active:scale-95 cursor-pointer"
                >
                  {this.state.copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Error</span>
                    </>
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
