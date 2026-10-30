import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Check, AlertCircle, FileCode, ShieldAlert } from 'lucide-react';
import { buildTruncateTableSql, buildDropTableSql } from '../lib';

export const TableActionModal: React.FC = () => {
  const {
    tableActionTarget,
    closeTableActionModal,
    stageTableAction,
    activeConnection,
    liveTables,
    liveSchemas,
  } = useAppStore();

  const isTruncate = tableActionTarget?.type === 'truncate';
  const tableName = tableActionTarget?.tableName || '';
  const engine = activeConnection?.engine || 'postgres';
  const isMysql = engine.toLowerCase().includes('mysql') || engine.toLowerCase().includes('maria');

  const [restartIdentity, setRestartIdentity] = useState<boolean>(true);
  const [cascade, setCascade] = useState<boolean>(false);
  const [ignoreFk, setIgnoreFk] = useState<boolean>(false);

  // Reset defaults on modal open
  useEffect(() => {
    if (tableActionTarget) {
      setRestartIdentity(true);
      setCascade(false);
      setIgnoreFk(false);
    }
  }, [tableActionTarget]);

  // Keyboard shortcut listener (Escape to close, Enter to stage)
  useEffect(() => {
    if (!tableActionTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTableActionModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tableActionTarget, restartIdentity, cascade, ignoreFk]);

  if (!tableActionTarget) return null;

  const connId = activeConnection?.id;
  const schema =
    liveSchemas[connId]?.[tableName]?.schema ||
    liveTables[connId]?.find((t) => t.name === tableName)?.schema ||
    (engine === 'postgres' ? 'public' : engine === 'snowflake' ? 'PUBLIC' : undefined);

  const previewSql = isTruncate
    ? buildTruncateTableSql(tableName, engine, schema, { restartIdentity, cascade, ignoreFk })
    : buildDropTableSql(tableName, engine, schema, { cascade, ignoreFk });

  const handleConfirm = () => {
    stageTableAction(
      isTruncate ? 'truncate' : 'delete',
      tableName,
      isTruncate ? { restartIdentity, cascade, ignoreFk } : { cascade, ignoreFk }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-100"
      onClick={() => closeTableActionModal()}
    >
      <div
        className="w-[440px] bg-[#1c1e22] dark:bg-[#18191c] border border-slate-700/80 rounded-xl shadow-2xl p-5 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title & Icon */}
        <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-slate-800">
          <div
            className={`p-2 rounded-lg ${
              isTruncate
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[13.5px] font-semibold text-slate-100">
              {isTruncate ? `Truncate table '${tableName}'` : `Drop table '${tableName}'`}
            </h3>
            <p className="text-[11px] text-slate-400">
              {isTruncate ? 'Empties all rows from the table' : 'Permanently drops table and structure'}
            </p>
          </div>
        </div>

        {/* Options checklist */}
        <div className="space-y-3 px-1 mb-4">
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
                  <div className="text-[12.5px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Restart identity
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
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
                  <div className="text-[12.5px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Cascade
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
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
                  <div className="text-[12.5px] font-medium text-slate-200">
                    Ignore foreign key checks
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Disable foreign key constraint checks during drop
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
                  <div className="text-[12.5px] font-medium text-slate-200 group-hover:text-white transition-colors">
                    Cascade
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Delete all rows linked by foreign keys
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live SQL Preview Box */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1.5 px-0.5">
            <span className="flex items-center space-x-1.5">
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              <span>Generated SQL Preview</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono uppercase">{engine}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#121316] border border-slate-800 font-mono text-[11px] text-emerald-400/90 break-all select-text leading-relaxed">
            {previewSql}
          </div>
        </div>

        {/* Transaction Safety Guarantee Notice */}
        <div className="mb-5 p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/20 text-sky-300 text-[11.5px] flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
          <div className="leading-snug">
            <span className="font-semibold text-sky-200">Safe Transaction: </span>
            This statement will <span className="underline decoration-sky-400/50">not execute immediately</span>. It will be staged to your transaction buffer. Press <kbd className="px-1 py-0.5 rounded bg-sky-900/60 border border-sky-600/30 font-mono text-[10px] text-sky-100 font-bold">⌘S</kbd> to Commit or <kbd className="px-1 py-0.5 rounded bg-sky-900/60 border border-sky-600/30 font-mono text-[10px] text-sky-100 font-bold">⌘Z</kbd> to Discard.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-700/50">
          <button
            type="button"
            onClick={closeTableActionModal}
            className="px-4 py-1.5 rounded-md bg-[#32363c] hover:bg-[#3d4249] text-slate-200 hover:text-white text-[12px] font-medium transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-1.5 rounded-md ${
              isTruncate
                ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white shadow-amber-900/20'
                : 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-900/20'
            } text-[12px] font-semibold shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95`}
          >
            <span>Stage to Transaction</span>
            <kbd className="px-1.5 py-0.5 bg-black/25 rounded text-[10px] font-mono font-extrabold text-white">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};
