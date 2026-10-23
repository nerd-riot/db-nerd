import React, { useState, useEffect, useRef } from 'react';
import { ConnectionProfile, PendingQueryEdit } from '../types';
import { executeRealQuery } from '../services/dbService';
import { useAppStore } from '../stores/useAppStore';
import {
  X,
  Copy,
  Check,
  Play,
  RotateCcw,
  Database,
  Table as TableIcon,
  Key,
  Terminal,
  AlertCircle,
  Edit2,
  Eye,
} from 'lucide-react';

interface QueryEditUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingEdits: Record<string, PendingQueryEdit>;
  activeConnection: ConnectionProfile;
  onApplySuccess: (executedSql: string, rowsAffected: number, durationMs?: number) => void;
  onDiscard: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onSendToEditor?: (sql: string) => void;
}

export const QueryEditUpdateModal: React.FC<QueryEditUpdateModalProps> = ({
  isOpen,
  onClose,
  pendingEdits,
  activeConnection,
  onApplySuccess,
  onDiscard,
  onShowToast,
  onSendToEditor,
}) => {
  const { addHistoryItem } = useAppStore();
  const editsList = Object.values(pendingEdits);
  const defaultSql = editsList.map((e) => e.generatedSql).join('\n\n');

  const [sqlText, setSqlText] = useState(defaultSql);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSqlText(editsList.map((e) => e.generatedSql).join('\n\n'));
      setExecutionError(null);
      setCopied(false);
      setViewMode('preview');
    }
  }, [isOpen, pendingEdits]);

  useEffect(() => {
    if (viewMode === 'edit') {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [viewMode]);

  // Handle keyboard shortcuts (⌘↵ to execute, Esc to close)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, sqlText, isExecuting]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlText);
    setCopied(true);
    onShowToast('📋 UPDATE query copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExecute = async () => {
    if (!sqlText.trim()) {
      onShowToast('⚠️ SQL statement is empty', 'warning');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    const startMs = performance.now();

    try {
      const res = await executeRealQuery(activeConnection, sqlText.trim());
      const durationMs = +(performance.now() - startMs).toFixed(1);

      if (!res.success && res.error) {
        setExecutionError(res.error);
        setViewMode('edit');
        setIsExecuting(false);
        addHistoryItem({
          sql: sqlText.trim(),
          connectionName: activeConnection.name,
          env: activeConnection.env,
          durationMs,
          rowsAffected: 0,
          status: 'error',
          errorMessage: res.error,
        });
        onShowToast(`❌ Execution failed: ${res.error}`, 'error');
        return;
      }

      setIsExecuting(false);
      const affected = res.rows_affected || editsList.length || 1;

      addHistoryItem({
        sql: sqlText.trim(),
        connectionName: activeConnection.name,
        env: activeConnection.env,
        durationMs,
        rowsAffected: affected,
        status: 'success',
      });

      onApplySuccess(sqlText.trim(), affected, durationMs);
      onShowToast(`✅ Successfully updated ${affected} record(s) in "${sampleEdit?.table || 'table'}" (${durationMs} ms)`, 'success');
      onClose();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to execute UPDATE query on server';
      const durationMs = +(performance.now() - startMs).toFixed(1);
      setIsExecuting(false);
      setExecutionError(errMsg);
      setViewMode('edit');

      addHistoryItem({
        sql: sqlText.trim(),
        connectionName: activeConnection.name,
        env: activeConnection.env,
        durationMs,
        rowsAffected: 0,
        status: 'error',
        errorMessage: errMsg,
      });

      onShowToast(`❌ Execution failed: ${errMsg}`, 'error');
    }
  };

  const sampleEdit = editsList[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150 font-sans select-none">
      <div className="w-full max-w-2xl bg-[#18191c] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 ring-1 ring-black/40">
        
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-[#141517] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center border border-sky-500/25">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-white leading-tight">Review & Commit Changes</h3>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[10px] font-mono font-medium">
                  {editsList.length} Pending Update{editsList.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Inspect modified cell values and generated SQL before applying to database.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Metadata Chips */}
          {sampleEdit && (
            <div className="flex items-center space-x-3 text-xs font-mono text-slate-400 bg-[#121315] border border-white/5 rounded-xl px-3.5 py-2">
              <div className="flex items-center space-x-1.5 truncate">
                <TableIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Table:</span>
                <span className="font-semibold text-slate-200">{sampleEdit.table}</span>
              </div>
              <span className="text-white/10">•</span>
              <div className="flex items-center space-x-1.5 truncate">
                <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Target PK:</span>
                <span className="font-semibold text-slate-200">
                  {sampleEdit.pkColumn} = {String(sampleEdit.pkValue)}
                </span>
              </div>
              <span className="text-white/10">•</span>
              <div className="flex items-center space-x-1.5 truncate">
                <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Connection:</span>
                <span className="font-semibold text-slate-200 truncate">{activeConnection.name}</span>
              </div>
            </div>
          )}

          {/* Visual Diff Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 px-1">
              <span>Modified Values Diff:</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {editsList.length} field{editsList.length > 1 ? 's' : ''} changed
              </span>
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#121315]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-[10px] uppercase font-mono text-slate-500 tracking-wider">
                    <th className="py-2 px-3 font-semibold">Column</th>
                    <th className="py-2 px-3 font-semibold">Original Value</th>
                    <th className="py-2 px-2 text-center w-6"></th>
                    <th className="py-2 px-3 font-semibold">New Value</th>
                    <th className="py-2 px-3 font-semibold text-right">Row Filter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {editsList.map((edit, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-200">
                        {edit.field}
                      </td>
                      <td className="py-2 px-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 line-through border border-rose-500/20 max-w-[140px] truncate">
                          {edit.originalValue === null || edit.originalValue === undefined ? 'NULL' : String(edit.originalValue)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-slate-600">➔</td>
                      <td className="py-2 px-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20 max-w-[160px] truncate">
                          {edit.newValue === null || edit.newValue === undefined ? 'NULL' : String(edit.newValue)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 text-[10px]">
                        {edit.pkColumn} = {String(edit.pkValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Execution Error Banner (if any) */}
          {executionError && (
            <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-200 space-y-1.5 animate-in fade-in">
              <div className="flex items-center space-x-2 font-semibold text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Database Rejected Statement — Review & Adjust SQL</span>
              </div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-black/40 p-2.5 rounded-lg border border-rose-500/20 text-rose-200 select-text leading-relaxed">
                {executionError}
              </pre>
            </div>
          )}

          {/* Generated SQL Statement Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-slate-300">Generated SQL:</span>
                <div className="inline-flex rounded-lg p-0.5 bg-black/40 border border-white/5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition cursor-pointer ${
                      viewMode === 'preview'
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Eye className="w-2.5 h-2.5" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('edit')}
                    className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition cursor-pointer ${
                      viewMode === 'edit'
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                    <span>Edit SQL</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                {onSendToEditor && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToEditor(sqlText);
                      onClose();
                    }}
                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-medium flex items-center space-x-1 transition cursor-pointer border border-white/5"
                    title="Paste this SQL into active query editor"
                  >
                    <Terminal className="w-3 h-3 text-sky-400" />
                    <span>Send to Editor</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-medium flex items-center space-x-1 transition cursor-pointer border border-white/5"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {viewMode === 'edit' ? (
              <div className="relative rounded-xl border border-sky-500/40 bg-[#0e0f11] overflow-hidden focus-within:ring-1 focus-within:ring-sky-500 shadow-inner">
                <textarea
                  ref={textareaRef}
                  value={sqlText}
                  onChange={(e) => {
                    setSqlText(e.target.value);
                    if (executionError) setExecutionError(null);
                  }}
                  rows={Math.max(3, Math.min(8, sqlText.split('\n').length + 1))}
                  className="w-full bg-transparent p-3 font-mono text-xs text-sky-200 placeholder-slate-600 focus:outline-none resize-y leading-relaxed select-text"
                  placeholder="UPDATE table SET col = val WHERE id = 1;"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#0e0f11] p-3 font-mono text-xs text-slate-200 select-text overflow-x-auto leading-relaxed shadow-inner">
                <pre className="text-slate-300 whitespace-pre-wrap">
                  {sqlText.split('\n').map((line, i) => {
                    // Highlight SQL keywords lightly
                    const highlighted = line
                      .replace(/\b(UPDATE|SET|WHERE|AND|OR|NOT|NULL|IS)\b/g, '<span class="text-sky-400 font-bold">$1</span>')
                      .replace(/('[^']*')/g, '<span class="text-emerald-400">$1</span>')
                      .replace(/\b(\d+)\b/g, '<span class="text-amber-300">$1</span>');
                    return (
                      <span key={i} className="block" dangerouslySetInnerHTML={{ __html: highlighted }} />
                    );
                  })}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#141517] border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onDiscard();
              onClose();
              onShowToast('↩️ Discarded pending cell modifications', 'info');
            }}
            className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1.5 cursor-pointer font-medium px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard Changes</span>
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white transition rounded-xl hover:bg-white/10 cursor-pointer font-medium"
            >
              Cancel (Esc)
            </button>

            <button
              type="button"
              disabled={isExecuting}
              onClick={handleExecute}
              className="px-4 py-1.5 bg-[#007aff] hover:bg-[#0069d9] text-white font-semibold text-xs rounded-xl transition flex items-center space-x-2 shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isExecuting ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Apply Changes (⌘↵)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
