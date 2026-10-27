import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

export const TableActionModal: React.FC = () => {
  const {
    tableActionTarget,
    closeTableActionModal,
    truncateTable,
    dropTable,
    activeConnection,
  } = useAppStore();

  const isTruncate = tableActionTarget?.type === 'truncate';
  const tableName = tableActionTarget?.tableName || '';
  const engine = activeConnection?.engine || 'postgres';
  const isMysql = engine.toLowerCase().includes('mysql') || engine.toLowerCase().includes('maria');

  const [restartIdentity, setRestartIdentity] = useState<boolean>(true);
  const [cascade, setCascade] = useState<boolean>(false);
  const [ignoreFk, setIgnoreFk] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset defaults on modal open
  useEffect(() => {
    if (tableActionTarget) {
      setRestartIdentity(true);
      setCascade(false);
      setIgnoreFk(false);
      setIsLoading(false);
      setErrorMessage(null);
    }
  }, [tableActionTarget]);

  // Keyboard shortcut listener (Escape to close, Enter to submit)
  useEffect(() => {
    if (!tableActionTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        e.preventDefault();
        closeTableActionModal();
      } else if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tableActionTarget, isLoading, restartIdentity, cascade, ignoreFk]);

  if (!tableActionTarget) return null;

  const handleConfirm = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isTruncate) {
        const res = await truncateTable(tableName, {
          restartIdentity,
          cascade,
          ignoreFk,
        });
        if (res && !res.success) {
          setErrorMessage(res.error || 'Truncate table operation failed');
          setIsLoading(false);
          return;
        }
      } else {
        const res = await dropTable(tableName, {
          cascade,
          ignoreFk,
        });
        if (res && !res.success) {
          setErrorMessage(res.error || 'Drop table operation failed');
          setIsLoading(false);
          return;
        }
      }
      closeTableActionModal();
    } catch (err: any) {
      setErrorMessage(String(err?.message || err));
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-100"
      onClick={() => {
        if (!isLoading) closeTableActionModal();
      }}
    >
      <div
        className="w-[390px] bg-[#1c1e22] dark:bg-[#18191c] border border-slate-700/80 rounded-xl shadow-2xl p-5 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title (matching TablePlus native modal) */}
        <h3 className="text-center text-[13.5px] font-semibold text-slate-100 mb-5">
          {isTruncate ? `Truncate table '${tableName}'` : `Delete table '${tableName}'`}
        </h3>

        {/* Options checklist */}
        <div className="space-y-3.5 px-1 mb-5">
          {isTruncate ? (
            <>
              {/* Option 1: Restart identity */}
              <div
                className="flex items-start space-x-2.5 cursor-pointer group"
                onClick={() => setRestartIdentity(!restartIdentity)}
              >
                <div
                  className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-colors flex-shrink-0 ${
                    restartIdentity
                      ? 'bg-[#007aff] text-white border border-[#007aff]'
                      : 'border border-slate-600 bg-slate-800/80 group-hover:border-slate-500'
                  }`}
                >
                  {restartIdentity && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Restart identity
                  </div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5">
                    This will reset the table sequences
                  </div>
                </div>
              </div>

              {/* Option 2: Cascade */}
              <div
                className="flex items-start space-x-2.5 cursor-pointer group"
                onClick={() => setCascade(!cascade)}
              >
                <div
                  className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-colors flex-shrink-0 ${
                    cascade
                      ? 'bg-[#007aff] text-white border border-[#007aff]'
                      : 'border border-slate-600 bg-slate-800/80 group-hover:border-slate-500'
                  }`}
                >
                  {cascade && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Cascade
                  </div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5">
                    Delete all linked rows by foreign keys
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Option 1: Ignore foreign key checks (MySQL only, disabled for Postgres) */}
              <div
                className={`flex items-start space-x-2.5 ${
                  isMysql ? 'cursor-pointer group' : 'opacity-40 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (isMysql) setIgnoreFk(!ignoreFk);
                }}
              >
                <div
                  className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-colors flex-shrink-0 ${
                    ignoreFk && isMysql
                      ? 'bg-[#007aff] text-white border border-[#007aff]'
                      : 'border border-slate-600 bg-slate-800/80'
                  }`}
                >
                  {ignoreFk && isMysql && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium text-slate-200">
                    Ignore foreign key checks
                  </div>
                </div>
              </div>

              {/* Option 2: Cascade */}
              <div
                className="flex items-start space-x-2.5 cursor-pointer group"
                onClick={() => setCascade(!cascade)}
              >
                <div
                  className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-colors flex-shrink-0 ${
                    cascade
                      ? 'bg-[#007aff] text-white border border-[#007aff]'
                      : 'border border-slate-600 bg-slate-800/80 group-hover:border-slate-500'
                  }`}
                >
                  {cascade && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Cascade
                  </div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5">
                    Delete all rows linked by foreign keys
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Error message banner (if execution returned database error) */}
        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 break-words font-mono text-[11px] max-h-24 overflow-y-auto">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Action Buttons (matching TablePlus Cancel / OK) */}
        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-700/50">
          <button
            type="button"
            disabled={isLoading}
            onClick={closeTableActionModal}
            className="px-4 py-1.5 rounded-md bg-[#32363c] hover:bg-[#3d4249] text-slate-200 hover:text-white text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirm}
            className="px-5 py-1.5 rounded-md bg-[#007aff] hover:bg-[#006ee6] text-white text-[12.5px] font-medium shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isLoading ? (isTruncate ? 'Truncating...' : 'Deleting...') : 'OK'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
