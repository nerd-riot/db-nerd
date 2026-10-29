import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { analyzeSqlSafety } from '../utils/sqlSafety';
import { ShieldAlert, Lock, AlertTriangle, X, Check, Copy, Terminal, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Tooltip } from './Tooltip';

export const SafetyVerificationModal: React.FC = () => {
  const {
    safetyConfirmation,
    confirmSafetyAction,
    cancelSafetyAction,
  } = useAppStore();

  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (safetyConfirmation) {
      setPasswordInput('');
      setErrorMessage(null);
      setIsCopied(false);
      setIsShaking(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [safetyConfirmation]);

  // Handle keyboard shortcuts (Esc to cancel, Enter to submit)
  useEffect(() => {
    if (!safetyConfirmation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelSafetyAction();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // If inside a multiline textarea, don't trigger submit
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safetyConfirmation, passwordInput]);

  if (!safetyConfirmation) return null;

  const isSafeMode = safetyConfirmation.mode === 'safe';
  const report = analyzeSqlSafety(safetyConfirmation.sqlText, safetyConfirmation.environment);

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyConfirmation.sqlText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  const handleSubmit = () => {
    const res = confirmSafetyAction(passwordInput);
    if (!res.success) {
      setErrorMessage(res.error || 'Authorization failed. Incorrect password.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      inputRef.current?.select();
    }
  };

  const envColorClass =
    safetyConfirmation.environment === 'prod'
      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40'
      : safetyConfirmation.environment === 'staging'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100 font-sans select-none">
      <div
        className={`w-full max-w-xl bg-white dark:bg-[#1a1b1e] border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 transition-all duration-200 ${
          isShaking ? 'animate-shake' : ''
        } ${
          report.hasCriticalIssue
            ? 'border-rose-500/60 shadow-rose-500/10'
            : isSafeMode
            ? 'border-rose-500/50 shadow-rose-500/10'
            : 'border-amber-500/50 shadow-amber-500/10'
        }`}
      >
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#141517] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {isSafeMode ? (
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/30">
                <Lock className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold leading-tight">
                {isSafeMode ? 'Safe Mode Authorization' : 'Alert Mode: Confirm Execution'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isSafeMode
                  ? 'Password verification required before sending queries to database.'
                  : 'Review statement carefully before executing against target environment.'}
              </p>
            </div>
          </div>

          <Tooltip side="bottom" content="Cancel" shortcut="Esc">
            <button
              onClick={cancelSafetyAction}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Target Connection Tag Bar */}
          <div className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-[#121315] border border-slate-200 dark:border-white/5 rounded-xl text-xs">
            <div className="flex items-center space-x-2 truncate">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${envColorClass}`}>
                {safetyConfirmation.environment}
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                {safetyConfirmation.connectionName}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
              Level: <span className="font-bold text-slate-700 dark:text-slate-300">{safetyConfirmation.safeModeLevel}</span>
            </span>
          </div>

          {/* Critical Hazard Alert Banner (e.g. Unrestricted UPDATE / DELETE) */}
          {report.issues.length > 0 && (
            <div className="space-y-2">
              {report.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-start space-x-2.5 text-xs ${
                    issue.severity === 'critical'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200'
                      : issue.severity === 'high'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
                      : 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800/80 text-sky-900 dark:text-sky-200'
                  }`}
                >
                  <ShieldAlert
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      issue.severity === 'critical'
                        ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <div>
                    <div className="font-bold leading-tight">{issue.title}</div>
                    <div className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{issue.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Statement Code Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center space-x-1.5 font-medium">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {safetyConfirmation.isCommit ? 'Atomic Transaction Statements to Commit:' : 'Statement(s) to be executed:'}
                </span>
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 text-[10px] font-semibold flex items-center space-x-1 transition cursor-pointer active:scale-95"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>

            <div className="relative bg-slate-900 text-sky-300 dark:bg-[#0e0f11] border border-slate-700/60 dark:border-white/10 rounded-xl p-3 font-mono text-xs max-h-48 overflow-y-auto overflow-x-auto shadow-inner leading-relaxed select-text">
              <pre className="whitespace-pre-wrap break-all">{safetyConfirmation.sqlText}</pre>
            </div>
          </div>

          {/* Password Prompt Input for Safe Mode */}
          {isSafeMode && (
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-rose-500" />
                  <span>Enter Password to Authorize:</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  Type password or "CONFIRM"
                </span>
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter database password or CONFIRM..."
                  className={`w-full bg-slate-50 dark:bg-[#121315] border rounded-xl px-3.5 py-2 pr-10 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none transition shadow-2xs ${
                    errorMessage
                      ? 'border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-white/15 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-0.5 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {errorMessage && (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 animate-in fade-in flex items-center space-x-1">
                  <span>❌</span>
                  <span>{errorMessage}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#141517] border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-white/10 rounded text-[10px] text-slate-700 dark:text-slate-300">Esc</kbd> to Cancel
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={cancelSafetyAction}
              className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer font-medium"
            >
              Cancel (Esc)
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              className={`px-4 py-1.5 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer text-white ${
                isSafeMode
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/25'
                  : report.hasCriticalIssue
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/25'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/25'
              }`}
            >
              {isSafeMode ? <Lock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              <span>{safetyConfirmation.actionLabel || (isSafeMode ? 'Authorize & Execute (↵)' : 'Execute Statement (↵)')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
