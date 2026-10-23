import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Sparkles, 
  Eye, 
  X, 
  Terminal, 
  Clock, 
  Key, 
  Copy, 
  Scissors, 
  Trash, 
  Trash2,
  Check, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Maximize2, 
  Minimize2, 
  AlertCircle, 
  WrapText, 
  BarChart2, 
  Square,
  SlidersHorizontal,
  Pin,
  Search,
  Download
} from 'lucide-react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history as cmHistory, historyKeymap } from '@codemirror/commands';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import { highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { useAppStore } from '../stores/useAppStore';
import { TABLE_SCHEMAS } from '../data/schemas';
import { getThemeDefinition } from '../themes/themeRegistry';
import { TableContextMenu } from './TableContextMenu';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import { BorderChase } from './BorderChase';
import { format as formatSql } from 'sql-formatter';
import { getQueryToExecute, extractTableAndPkFromQuery } from '../utils/sqlParser';
import { InlineCellEditor } from './InlineCellEditor';
import { QueryEditUpdateModal } from './QueryEditUpdateModal';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { QueryChartView } from './QueryChartView';
import { executeRealQuery } from '../services/dbService';
import { ColumnDefinition, PendingQueryEdit } from '../types';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

// Build rich SQL Schema with column types, primary key badges, and descriptions for autocompletion
const buildSqlSchema = () => {
  const schema: Record<string, any[]> = {};
  Object.entries(TABLE_SCHEMAS).forEach(([tbl, info]) => {
    schema[tbl] = info.columns.map((c) => ({
      label: c.name,
      type: c.isPrimaryKey ? 'keyword' : 'property',
      detail: `${c.type}${c.isPrimaryKey ? ' (PK)' : c.isForeignKey ? ' (FK)' : ''}`,
      info: c.comment || (c.defaultValue ? `Default: ${c.defaultValue}` : undefined),
      boost: c.isPrimaryKey ? 99 : 50,
    }));
  });
  return schema;
};

const SQL_SCHEMA = buildSqlSchema();

// Dynamic alias resolver: e.g. "FROM users u" or "FROM users AS u" -> u resolves to users
function getTableForAlias(docText: string, aliasOrName: string): string | null {
  if (SQL_SCHEMA[aliasOrName]) return aliasOrName;
  const regex = new RegExp(`(?:FROM|JOIN)\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s+(?:AS\\s+)?${aliasOrName}\\b`, 'i');
  const match = docText.match(regex);
  if (match && SQL_SCHEMA[match[1]]) {
    return match[1];
  }
  return null;
}

// Custom autocomplete provider for table.column navigation and FROM/JOIN table suggestions
function customDotAndTableCompletion(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 1. Triggered on typing after a dot: e.g. users. or u. or tuple. or goose_db_version.
  const dotMatch = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z0-9_]*)$/);
  if (dotMatch) {
    const [_, tableOrAlias, prefix] = dotMatch;
    const fullDoc = context.state.doc.toString();
    const actualTable = getTableForAlias(fullDoc, tableOrAlias);

    if (actualTable && SQL_SCHEMA[actualTable]) {
      return {
        from: context.pos - prefix.length,
        options: SQL_SCHEMA[actualTable],
        validFor: /^[a-zA-Z0-9_]*$/,
      };
    }
  }

  // 2. Triggered on FROM / JOIN / INTO clause to suggest table names
  const fromJoinMatch = textBefore.match(/(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z0-9_]*)$/i);
  if (fromJoinMatch) {
    const prefix = fromJoinMatch[1];
    const tableOptions = Object.keys(SQL_SCHEMA).map((tbl) => ({
      label: tbl,
      type: 'type',
      detail: 'table',
      boost: 90,
    }));
    return {
      from: context.pos - prefix.length,
      options: tableOptions,
    };
  }

  return null;
}


export const SqlEditor: React.FC = () => {
  const {
    activeTabId,
    sqlTabStates,
    setSqlTabQuery,
    runSqlQuery,
    cancelSqlQuery,
    setActiveQueryResultTab,
    closeQueryResultTab,
    togglePinQueryResultTab,
    selectedTable,
    activeConnection,
    setReconnectModalOpen,
    sqlEditorSplitHeight,
    setSqlEditorSplitHeight,
    isSqlResultsCollapsed,
    toggleSqlResultsCollapsed,
    resolvedTheme,
    settings,
    openNewQueryTab,
    closeTab,
    showToast,
    history,
    addHistoryItem,
    updateSqlTabResults,
    setSelectedRowData,
  } = useAppStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, loc: 0 });
  const [queryLimit, setQueryLimit] = useState<string>('No limit');
  const [isLimitMenuOpen, setIsLimitMenuOpen] = useState(false);
  const [isBeautifyMenuOpen, setIsBeautifyMenuOpen] = useState(false);
  const [isRunMenuOpen, setIsRunMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [enableSyntaxHighlighting, setEnableSyntaxHighlighting] = useState(true);
  const [isConsoleDrawerOpen, setIsConsoleDrawerOpen] = useState(true);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [resultsSubTab, setResultsSubTab] = useState<'data' | 'message' | 'history' | 'chart'>('data');
  const [isApplyingDirect, setIsApplyingDirect] = useState(false);
  const [sqlPage, setSqlPage] = useState(0);

  const runMenuRef = useRef<HTMLDivElement>(null);
  const limitMenuRef = useRef<HTMLDivElement>(null);
  const beautifyMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const handleSplitterResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = sqlEditorSplitHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.min(650, Math.max(80, startHeight + delta));
      setSqlEditorSplitHeight(newHeight);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const tabState = sqlTabStates[activeTabId] || {
    tabId: activeTabId,
    query: `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend\nFROM users u\nLEFT JOIN user_orders o ON o.user_id = u.id\nWHERE u.status = 'active'\nGROUP BY u.id, u.email\nORDER BY total_spend DESC LIMIT 50;`,
    results: [
      { id: 501, email: 'alex.turner@corp.io', total_orders: 14, total_spend: 2030.0 },
      { id: 502, email: 'sarah.connor@cyberdyne.net', total_orders: 29, total_spend: 4210.5 },
      { id: 503, email: 'khoa.nguyen@ai.lab', total_orders: 102, total_spend: 12450.0 },
    ],
    columns: ['id', 'email', 'total_orders', 'total_spend'],
    durationMs: 1.4,
    rowsCount: 3,
    isExecuting: false,
  };

  // Live timer for long running query execution (matches TablePlus Waiting: X.X s)
  useEffect(() => {
    if (!tabState.isExecuting) {
      setWaitingSeconds(0);
      return;
    }
    const start = performance.now();
    const interval = setInterval(() => {
      setWaitingSeconds(+((performance.now() - start) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [tabState.isExecuting]);

  // Inline editing state for query results
  const [editingCell, setEditingCell] = useState<{ rowId: any; col: string; rowIndex: number } | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingQueryEdit>>({});
  const [editedRowOverrides, setEditedRowOverrides] = useState<Record<string, Record<string, any>>>({});
  const [isQueryEditModalOpen, setIsQueryEditModalOpen] = useState(false);
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;

  // Reset cell edits and pagination on query tab switch or new result selection
  useEffect(() => {
    setPendingEdits({});
    setEditedRowOverrides({});
    setEditingCell(null);
    setSqlPage(0);
  }, [activeTabId, tabState.activeResultId]);

  // Close dropdown menus when clicking outside or pressing Escape, and handle ⌘S for query edits
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as Node)) {
        setIsRunMenuOpen(false);
      }
      if (limitMenuRef.current && !limitMenuRef.current.contains(e.target as Node)) {
        setIsLimitMenuOpen(false);
      }
      if (beautifyMenuRef.current && !beautifyMenuRef.current.contains(e.target as Node)) {
        setIsBeautifyMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsRunMenuOpen(false);
        setIsLimitMenuOpen(false);
        setIsBeautifyMenuOpen(false);
        setIsExportMenuOpen(false);
        setIsSearchOpen(false);
        setEditingCell(null);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        if (Object.keys(pendingEditsRef.current).length > 0) {
          e.preventDefault();
          handleDirectApplyRef.current();
        }
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Helper to format values for SQL queries
  const formatSqlLiteral = (val: any): string => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  // Helper to infer column type
  const inferColumnType = (val: any, colName: string): string => {
    for (const schema of Object.values(TABLE_SCHEMAS)) {
      const match = schema.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      if (match) return match.type;
    }
    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'numeric';
    if (typeof val === 'boolean') return 'boolean';
    if (val instanceof Date) return 'timestamp';
    if (typeof val === 'object' && val !== null) return 'jsonb';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return 'timestamp';
    return 'varchar';
  };

  const handleStartEditing = (rowId: any, rowIndex: number, col: string) => {
    if (col.toLowerCase() === 'error' || tabState.isExecuting) return;
    setEditingCell({ rowId, col, rowIndex });
  };

  const handleSaveCell = (rowId: any, rowIndex: number, col: string, newVal: any, rowObj: any) => {
    const currentVal = rowObj[col];
    if (currentVal === newVal) {
      setEditingCell(null);
      return;
    }

    const currentQuery = activeResultItem?.query || tabState.query;
    const { table: detectedTable, pkColumn: detectedPk } = extractTableAndPkFromQuery(currentQuery, columns);

    const pkValue = rowObj[detectedPk] !== undefined ? rowObj[detectedPk] : (rowObj.id !== undefined ? rowObj.id : rowId);

    const formattedVal = formatSqlLiteral(newVal);
    const formattedPk = formatSqlLiteral(pkValue);
    const generatedSql = `UPDATE ${detectedTable}\nSET ${col} = ${formattedVal}\nWHERE ${detectedPk} = ${formattedPk};`;

    setEditedRowOverrides((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [col]: newVal,
      },
    }));

    const editKey = `${rowId}:${col}`;
    setPendingEdits((prev) => ({
      ...prev,
      [editKey]: {
        rowId,
        rowIndex,
        field: col,
        originalValue: currentVal,
        newValue: newVal,
        table: detectedTable,
        pkColumn: detectedPk,
        pkValue,
        generatedSql,
      },
    }));

    setEditingCell(null);
    showToast(`✏️ Modified ${col} ➔ Press ⌘S or Review & Execute SQL to apply`);
  };

  const handleDiscardPendingEdits = () => {
    setPendingEdits({});
    setEditedRowOverrides({});
    setEditingCell(null);
    showToast('↩️ Discarded pending cell modifications', 'info');
  };

  const handleApplySuccess = (_executedSql: string, rowsAffected: number, durationMs?: number) => {
    setIsQueryEditModalOpen(false);

    // Commit pending edits permanently into results so grid updates and stays updated
    const edits = Object.values(pendingEdits);
    if (edits.length > 0) {
      const updatedResults = (tabState.results || []).map((row: any) => {
        let matchingRow = { ...row };
        edits.forEach((edit) => {
          const rowPkVal = row[edit.pkColumn] !== undefined ? row[edit.pkColumn] : row.id;
          if (String(rowPkVal) === String(edit.pkValue)) {
            matchingRow[edit.field] = edit.newValue;
          }
        });
        return matchingRow;
      });

      const ms = durationMs || 10;
      const targetTable = edits[0]?.table || 'table';
      updateSqlTabResults(
        activeTabId,
        updatedResults,
        `Query 1 OK: ${rowsAffected || edits.length} row(s) updated in ${targetTable} (${ms} ms)`
      );
    }

    setPendingEdits({});
    setEditedRowOverrides({});
    setEditingCell(null);
  };

  const handleDirectApplyPendingEdits = async () => {
    const editsList = Object.values(pendingEdits);
    if (editsList.length === 0) return;

    setIsApplyingDirect(true);
    const sqlToRun = editsList.map((e) => e.generatedSql).join('\n\n');
    const startMs = performance.now();

    try {
      const res = await executeRealQuery(activeConnection, sqlToRun);
      const durationMs = +(performance.now() - startMs).toFixed(1);

      if (!res.success && res.error) {
        setIsApplyingDirect(false);
        addHistoryItem({
          sql: sqlToRun,
          connectionName: activeConnection.name,
          env: activeConnection.env,
          durationMs,
          rowsAffected: 0,
          status: 'error',
          errorMessage: res.error,
        });
        showToast(`❌ Failed to update: ${res.error}`, 'error');
        // Open review modal so user can see and fix the error
        setIsQueryEditModalOpen(true);
        return;
      }

      setIsApplyingDirect(false);
      const affected = res.rows_affected || editsList.length || 1;

      addHistoryItem({
        sql: sqlToRun,
        connectionName: activeConnection.name,
        env: activeConnection.env,
        durationMs,
        rowsAffected: affected,
        status: 'success',
      });

      handleApplySuccess(sqlToRun, affected, durationMs);
      showToast(`✅ Successfully updated ${affected} record(s) in "${editsList[0]?.table || 'table'}" (${durationMs} ms)`, 'success');
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to execute query';
      const durationMs = +(performance.now() - startMs).toFixed(1);
      setIsApplyingDirect(false);

      addHistoryItem({
        sql: sqlToRun,
        connectionName: activeConnection.name,
        env: activeConnection.env,
        durationMs,
        rowsAffected: 0,
        status: 'error',
        errorMessage: errMsg,
      });

      showToast(`❌ Failed to update: ${errMsg}`, 'error');
      setIsQueryEditModalOpen(true);
    }
  };

  const handleDirectApplyRef = useRef(handleDirectApplyPendingEdits);
  handleDirectApplyRef.current = handleDirectApplyPendingEdits;

  const handleSendToEditor = (sql: string) => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      const newDoc = currentDoc.trim() ? `${currentDoc}\n\n${sql}` : sql;
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: newDoc },
      });
      setSqlTabQuery(activeTabId, newDoc);
      showToast('📝 Inserted UPDATE statement into SQL Editor');
    }
  };

  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);
  const [contextMenuRows, setContextMenuRows] = useState<any[]>([]);
  const [editorContextPos, setEditorContextPos] = useState<ContextMenuPosition | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string | number>>(new Set([501]));
  const [inspectingRow, setInspectingRow] = useState<any | null>(null);
  const [wrapText, setWrapText] = useState<boolean>(true);
  const [hasSelection, setHasSelection] = useState<boolean>(false);

  const handleRun = () => {
    setIsRunMenuOpen(false);
    if (activeConnection?.connectionStatus === 'failed') {
      setReconnectModalOpen(true);
      return;
    }
    if (!viewRef.current) return;
    const view = viewRef.current;
    const currentCode = view.state.doc.toString();
    const { from, to } = view.state.selection.main;

    const target = getQueryToExecute(currentCode, from, to);
    if (!target.query.trim()) {
      showToast('⚠️ No SQL statement to execute');
      return;
    }

    runSqlQuery(activeTabId, target.query, {
      isSelection: target.isSelection,
      statementIndex: target.statementIndex,
      totalStatements: target.totalStatements,
    });
  };

  const handleRunAll = () => {
    setIsRunMenuOpen(false);
    if (activeConnection?.connectionStatus === 'failed') {
      setReconnectModalOpen(true);
      return;
    }
    if (!viewRef.current) return;
    const currentCode = viewRef.current.state.doc.toString();
    runSqlQuery(activeTabId, currentCode, { mode: 'all' });
  };

  const handleCancel = () => {
    cancelSqlQuery(activeTabId);
  };

  const handleRunRef = useRef(handleRun);
  handleRunRef.current = handleRun;

  const handleRunAllRef = useRef(handleRunAll);
  handleRunAllRef.current = handleRunAll;

  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;

  const handleFormat = () => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { from, to } = view.state.selection.main;
    const hasSelection = from !== to;
    const textToFormat = hasSelection
      ? view.state.sliceDoc(from, to)
      : view.state.doc.toString();

    if (!textToFormat.trim()) {
      showToast('⚠️ No SQL text to format');
      return;
    }

    const engine = activeConnection?.engine || 'postgres';
    const dialect =
      engine === 'postgres'
        ? 'postgresql'
        : engine === 'mysql'
        ? 'mysql'
        : engine === 'snowflake'
        ? 'snowflake'
        : 'sql';

    try {
      const formatted = formatSql(textToFormat, {
        language: dialect as any,
        keywordCase: 'upper',
        dataTypeCase: 'upper',
        functionCase: 'upper',
        linesBetweenQueries: 2,
        indentStyle: 'standard',
        tabWidth: 2,
        useTabs: false,
      });

      if (hasSelection) {
        view.dispatch({
          changes: { from, to, insert: formatted },
          selection: { anchor: from, head: from + formatted.length },
        });
        setSqlTabQuery(activeTabId, view.state.doc.toString());
        showToast('✨ Formatted Selected SQL');
      } else {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
          selection: { anchor: Math.min(from, formatted.length) },
        });
        setSqlTabQuery(activeTabId, formatted);
        showToast('✨ Formatted Full SQL Query');
      }
    } catch (err) {
      console.warn('SQL format dialect error, trying generic sql:', err);
      try {
        const fallbackFormatted = formatSql(textToFormat, {
          language: 'sql',
          keywordCase: 'upper',
          dataTypeCase: 'upper',
          functionCase: 'upper',
          linesBetweenQueries: 2,
          indentStyle: 'standard',
          tabWidth: 2,
          useTabs: false,
        });

        if (hasSelection) {
          view.dispatch({
            changes: { from, to, insert: fallbackFormatted },
            selection: { anchor: from, head: from + fallbackFormatted.length },
          });
          setSqlTabQuery(activeTabId, view.state.doc.toString());
          showToast('✨ Formatted Selected SQL');
        } else {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: fallbackFormatted },
            selection: { anchor: Math.min(from, fallbackFormatted.length) },
          });
          setSqlTabQuery(activeTabId, fallbackFormatted);
          showToast('✨ Formatted Full SQL Query');
        }
      } catch (fallbackErr) {
        showToast('⚠️ SQL syntax error: check quotes or parentheses');
      }
    }
  };

  const handleFormatRef = useRef(handleFormat);
  handleFormatRef.current = handleFormat;

  const handleTransformSql = (transform: 'uppercase' | 'lowercase' | 'minify') => {
    setIsBeautifyMenuOpen(false);
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { from, to } = view.state.selection.main;
    const hasSel = from !== to;
    const text = hasSel ? view.state.sliceDoc(from, to) : view.state.doc.toString();
    if (!text.trim()) return;

    let converted = text;
    if (transform === 'uppercase') {
      converted = text.toUpperCase();
    } else if (transform === 'lowercase') {
      converted = text.toLowerCase();
    } else if (transform === 'minify') {
      converted = text.replace(/\s+/g, ' ').trim();
    }

    if (hasSel) {
      view.dispatch({
        changes: { from, to, insert: converted },
        selection: { anchor: from, head: from + converted.length },
      });
      setSqlTabQuery(activeTabId, view.state.doc.toString());
    } else {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: converted },
        selection: { anchor: Math.min(from, converted.length) },
      });
      setSqlTabQuery(activeTabId, converted);
    }
    showToast(`✨ Transformed SQL (${transform})`);
  };

  // Initialize CodeMirror 6 with SQL language, schema completion, and syntax highlighting
  useEffect(() => {
    if (!editorRef.current) return;

    const currentThemeId = settings.appTheme || (resolvedTheme === 'light' ? 'default-light' : 'default-dark');
    const themeDef = getThemeDefinition(currentThemeId);
    const activeHighlight = themeDef.sqlHighlight;
    const activeTheme = themeDef.sqlTheme;

    const state = EditorState.create({
      doc: tabState.query,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        cmHistory(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        sql({
          dialect: PostgreSQL,
          schema: SQL_SCHEMA,
          defaultTable: selectedTable || 'users',
          upperCaseKeywords: true,
        }),
        PostgreSQL.language.data.of({
          autocomplete: customDotAndTableCompletion,
        }),
        autocompletion({
          activateOnTyping: true,
          maxRenderedOptions: 30,
        }),
        syntaxHighlighting(activeHighlight),
        activeTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setSqlTabQuery(activeTabId, update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const { from, to } = update.state.selection.main;
            setHasSelection(from !== to);
            const lineObj = update.state.doc.lineAt(from);
            setCursorPos({
              line: lineObj.number,
              col: from - lineObj.from + 1,
              loc: from,
            });
          }
        }),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              handleRunRef.current();
              return true;
            },
          },
          {
            key: 'Mod-r',
            run: () => {
              handleRunRef.current();
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: () => {
              handleFormatRef.current();
              return true;
            },
          },
          {
            key: 'Mod-Shift-Enter',
            run: () => {
              handleRunAllRef.current();
              return true;
            },
          },
          {
            key: 'Shift-Mod-Enter',
            run: () => {
              handleRunAllRef.current();
              return true;
            },
          },
          {
            key: 'Mod-.',
            run: () => {
              handleCancelRef.current();
              return true;
            },
          },
          {
            key: 'Mod-s',
            run: () => {
              if (Object.keys(pendingEditsRef.current).length > 0) {
                setIsQueryEditModalOpen(true);
                return true;
              }
              return false;
            },
          },
          {
            key: 'Mod-t',
            run: () => {
              openNewQueryTab();
              return true;
            },
          },
          {
            key: 'Mod-e',
            run: () => {
              openNewQueryTab();
              return true;
            },
          },
          {
            key: 'Mod-w',
            run: () => {
              closeTab(activeTabId);
              return true;
            },
          },
          {
            key: 'Alt-Shift-f',
            run: () => {
              handleFormatRef.current();
              return true;
            },
          },
          {
            key: 'Mod-Shift-f',
            run: () => {
              handleFormatRef.current();
              return true;
            },
          },
          ...completionKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [activeTabId, selectedTable, resolvedTheme, settings.appTheme]);

  useEffect(() => {
    if (viewRef.current && tabState.query !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: tabState.query },
      });
    }
  }, [tabState.query]);

  const queryItems = (tabState.queryResults && tabState.queryResults.length > 0)
    ? tabState.queryResults
    : [
        {
          id: 'q-1',
          title: 'Query 1',
          query: tabState.lastExecutedQuery || tabState.query,
          results: tabState.results,
          columns: tabState.columns,
          durationMs: tabState.durationMs,
          rowsCount: tabState.rowsCount,
          executedAt: tabState.executedAt || 'Just now',
          status: (tabState.error ? 'error' : 'success') as 'error' | 'success',
          isPinned: false,
          statusMessage: tabState.error ? `Query 1 Error: ${tabState.error}` : `Query 1 OK: ${tabState.rowsCount} rows`,
        },
      ];

  const activeResultItem = queryItems.find((r) => r.id === (tabState.activeResultId || queryItems[0].id)) || queryItems[0];
  const rawResults = activeResultItem ? activeResultItem.results : tabState.results;
  const columns = (activeResultItem?.columns && activeResultItem.columns.length > 0)
    ? activeResultItem.columns
    : tabState.columns.length > 0
    ? tabState.columns
    : Object.keys(rawResults[0] || {});

  const modifiedResults = useMemo(
    () =>
      (rawResults || []).map((r, idx) => {
        const rowId = r.id !== undefined ? r.id : `row-${idx}`;
        const overrides = editedRowOverrides[rowId];
        return overrides ? { ...r, ...overrides } : r;
      }),
    [rawResults, editedRowOverrides]
  );

  const displayResults = useMemo(() => {
    const filter = searchFilter.trim().toLowerCase();
    if (!filter) return modifiedResults;
    return modifiedResults.filter((r) =>
      Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(filter))
    );
  }, [modifiedResults, searchFilter]);

  const results = displayResults;
  const SQL_PAGE_SIZE = 200;
  const totalSqlPages = Math.max(1, Math.ceil(results.length / SQL_PAGE_SIZE));
  const safeSqlPage = Math.min(sqlPage, totalSqlPages - 1);
  const paginatedSqlResults = useMemo(
    () => results.slice(safeSqlPage * SQL_PAGE_SIZE, (safeSqlPage + 1) * SQL_PAGE_SIZE),
    [results, safeSqlPage]
  );

  const colMetaMap = useMemo(() => {
    const map: Record<string, { foundType?: string; isPk: boolean; sampleVal: any; colDef: ColumnDefinition }> = {};
    for (const col of columns) {
      const firstRowWithVal = results.find((r) => r[col] !== null && r[col] !== undefined);
      const sampleVal = firstRowWithVal ? firstRowWithVal[col] : undefined;
      let foundType: string | undefined;
      let isPk = false;
      for (const schema of Object.values(TABLE_SCHEMAS)) {
        const match = schema.columns.find((c) => c.name === col);
        if (match) {
          foundType = match.type;
          isPk = !!match.isPrimaryKey;
          break;
        }
      }
      map[col] = {
        foundType,
        isPk,
        sampleVal,
        colDef: {
          name: col,
          type: foundType || inferColumnType(sampleVal, col),
          isPrimaryKey: isPk || col.toLowerCase() === 'id' || col.toLowerCase().endsWith('_id'),
          isNullable: true,
        },
      };
    }
    return map;
  }, [columns, results]);

  const activeDuration = activeResultItem ? activeResultItem.durationMs : tabState.durationMs;
  const activeError = activeResultItem ? activeResultItem.error : tabState.error;
  const isErrorResult = Boolean(
    activeError ||
    (columns.length === 1 && columns[0]?.toLowerCase() === 'error') ||
    (rawResults.length > 0 && typeof rawResults[0]?.error === 'string')
  );

  const handleExport = (format: 'csv' | 'json' | 'sql') => {
    setIsExportMenuOpen(false);
    const dataToExport = displayResults;
    if (!dataToExport || dataToExport.length === 0) {
      showToast('⚠️ No data to export');
      return;
    }
    let content = '';
    let mimeType = 'text/plain';
    let filename = `query_result_${Date.now()}`;

    if (format === 'json') {
      content = JSON.stringify(dataToExport, null, 2);
      mimeType = 'application/json';
      filename += '.json';
    } else if (format === 'csv') {
      const cols = columns.length > 0 ? columns : Object.keys(dataToExport[0] || {});
      const header = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
      const rows = dataToExport.map((r) =>
        cols
          .map((c) => {
            const val = r[c];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      );
      content = [header, ...rows].join('\n');
      mimeType = 'text/csv';
      filename += '.csv';
    } else if (format === 'sql') {
      const tbl = selectedTable || 'exported_table';
      const cols = columns.length > 0 ? columns : Object.keys(dataToExport[0] || {});
      const statements = dataToExport.map((r) => {
        const vals = cols.map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        return `INSERT INTO "${tbl}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});`;
      });
      content = statements.join('\n');
      mimeType = 'application/sql';
      filename += '.sql';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`💾 Exported ${dataToExport.length} rows as ${format.toUpperCase()}`);
  };

  useEffect(() => {
    if (isErrorResult) {
      setResultsSubTab('message');
    }
  }, [isErrorResult, tabState.activeResultId]);

  return (
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900/60 overflow-hidden relative">
      {/* Top Split: CodeMirror 6 Editor Container */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setEditorContextPos({ x: e.clientX, y: e.clientY });
        }}
        style={!isSqlResultsCollapsed ? { height: `${sqlEditorSplitHeight}px` } : undefined}
        className={`${isSqlResultsCollapsed ? 'flex-1' : ''} border-b border-slate-300 dark:border-slate-800/80 relative flex flex-col bg-white dark:bg-slate-950 flex-shrink-0 overflow-hidden`}
      >
        <div ref={editorRef} className="flex-1 w-full h-full overflow-hidden" />

        {/* TablePlus Editor Control Bar (Sliders, cursor tracker, No limit, Beautify, Run Current) */}
        <div className="h-8 bg-slate-100 dark:bg-[#202124] border-t border-slate-300 dark:border-white/10 px-3 flex items-center justify-between text-xs select-none flex-shrink-0 z-10">
          {/* Left: Sliders icon + cursor tracker */}
          <div className="flex items-center space-x-2 text-slate-500 dark:text-[#8e9095] font-mono text-[11px]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>line {cursorPos.line}, column {cursorPos.col}, location {cursorPos.loc}</span>
            {activeConnection?.connectionStatus === 'failed' && (
              <button
                onClick={() => setReconnectModalOpen(true)}
                className="ml-2 h-5 px-2 bg-rose-500/20 border border-rose-500/40 text-rose-400 rounded text-[10px] font-sans font-medium flex items-center space-x-1 cursor-pointer"
              >
                <AlertCircle className="w-3 h-3" />
                <span>Disconnected (⌘K)</span>
              </button>
            )}
          </div>

          {/* Right: [ History ] [ No limit ⌵ ] [ Beautify ⌘I ⌵ ] [ Run Current ⌘↵ ⌵ ] */}
          <div className="flex items-center space-x-2">
            {/* History Toggle Button */}
            <button
              onClick={() => setResultsSubTab(resultsSubTab === 'history' ? 'data' : 'history')}
              className={`h-6.5 px-2.5 rounded-md border text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-xs ${
                resultsSubTab === 'history'
                  ? 'bg-sky-500 text-white border-sky-400 font-semibold'
                  : 'bg-slate-200/90 dark:bg-[#343538] hover:bg-slate-300 dark:hover:bg-[#404145] text-slate-800 dark:text-slate-200 border-slate-300 dark:border-white/10'
              }`}
              title="Toggle Query History (⌘H)"
            >
              <Clock className="w-3 h-3 text-sky-400" />
              <span>History</span>
              {history.length > 0 && (
                <span className="text-[10px] font-mono px-1 py-0.2 rounded-full bg-black/20 dark:bg-white/15">
                  {history.length}
                </span>
              )}
            </button>

            {/* Limit Selector */}
            <div className="relative" ref={limitMenuRef}>
              <div className="inline-flex items-center bg-slate-200/90 dark:bg-[#343538] hover:bg-slate-300 dark:hover:bg-[#404145] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-white/10 rounded-md text-xs font-medium transition shadow-xs overflow-hidden h-6.5">
                <button
                  onClick={() => setIsLimitMenuOpen(!isLimitMenuOpen)}
                  className="px-2.5 py-0.5 flex items-center space-x-1 cursor-pointer"
                  title="Query result limit"
                >
                  <span>{queryLimit}</span>
                </button>
                <div className="h-3 w-px bg-slate-300 dark:bg-white/10" />
                <button
                  onClick={() => setIsLimitMenuOpen(!isLimitMenuOpen)}
                  className="px-1.5 py-0.5 flex items-center justify-center cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>

              {isLimitMenuOpen && (
                <div className="absolute right-0 top-7.5 w-36 bg-white dark:bg-[#1f2023] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 py-1 text-slate-800 dark:text-slate-200 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                  {['No limit', '100', '500', '1000', '5000'].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => {
                        setQueryLimit(lim);
                        setIsLimitMenuOpen(false);
                        showToast(`Set default query limit to ${lim}`);
                      }}
                      className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer ${
                        queryLimit === lim ? 'font-bold text-sky-600 dark:text-sky-400' : ''
                      }`}
                    >
                      <span>{lim}</span>
                      {queryLimit === lim && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Beautify Button */}
            <div className="relative" ref={beautifyMenuRef}>
              <div className="inline-flex items-center bg-slate-200/90 dark:bg-[#343538] hover:bg-slate-300 dark:hover:bg-[#404145] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-white/10 rounded-md text-xs font-medium transition shadow-xs overflow-hidden h-6.5">
                <button
                  onClick={handleFormat}
                  className="px-2.5 py-0.5 flex items-center space-x-1.5 cursor-pointer"
                  title="Beautify SQL (⌘I / ⇧⌥F)"
                >
                  <span>Beautify</span>
                  <kbd className="text-[10px] opacity-70 font-mono">⌘I</kbd>
                </button>
                <div className="h-3 w-px bg-slate-300 dark:bg-white/10" />
                <button
                  onClick={() => setIsBeautifyMenuOpen(!isBeautifyMenuOpen)}
                  className="px-1.5 py-0.5 flex items-center justify-center cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>

              {isBeautifyMenuOpen && (
                <div className="absolute right-0 top-7.5 w-44 bg-white dark:bg-[#1f2023] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 py-1 text-slate-800 dark:text-slate-200 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setIsBeautifyMenuOpen(false);
                      handleFormat();
                    }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                  >
                    <span>Beautify SQL</span>
                    <kbd className="text-[10px] font-mono opacity-70">⌘I</kbd>
                  </button>
                  <button
                    onClick={() => handleTransformSql('uppercase')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                  >
                    <span>To UPPERCASE</span>
                  </button>
                  <button
                    onClick={() => handleTransformSql('lowercase')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                  >
                    <span>To lowercase</span>
                  </button>
                  <button
                    onClick={() => handleTransformSql('minify')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                  >
                    <span>Minify SQL</span>
                  </button>
                </div>
              )}
            </div>

            {/* Run Current / Cancel Split Button (Matches TablePlus Screenshot 1 & 2) */}
            {tabState.isExecuting ? (
              <div className="relative inline-flex items-center shadow-xs">
                <div className="inline-flex items-center bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-semibold transition overflow-hidden h-6.5">
                  <button
                    onClick={handleCancel}
                    className="relative overflow-hidden px-2.5 py-0.5 flex items-center space-x-1.5 cursor-pointer leading-none active:scale-95"
                    title="Cancel Query Execution (⌘.)"
                  >
                    <BorderChase color="amber" dual={true} speed="fast" borderWidth={2} glow={true} />
                    <Square className="relative z-1 w-3 h-3 fill-current shrink-0 animate-pulse" />
                    <span className="relative z-1">Cancel</span>
                    <kbd className="relative z-1 px-1 py-0.2 bg-black/20 rounded text-[9px] font-mono text-white font-extrabold leading-none">⌘.</kbd>
                  </button>
                  <div className="h-3 w-px bg-white/20" />
                  <button
                    onClick={() => setIsRunMenuOpen(!isRunMenuOpen)}
                    className="px-1.5 py-0.5 flex items-center justify-center cursor-pointer hover:bg-black/10"
                    title="Execution Options"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative" ref={runMenuRef}>
                <div className="inline-flex items-center bg-slate-200/90 dark:bg-[#343538] hover:bg-slate-300 dark:hover:bg-[#404145] text-slate-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-md text-xs font-medium transition shadow-xs overflow-hidden h-6.5">
                  <button
                    onClick={handleRun}
                    className="px-2.5 py-0.5 flex items-center space-x-1.5 cursor-pointer"
                    title={hasSelection ? "Run Selected Query (⌘↵ / ⌘R)" : "Run Current Query at Pointer (⌘↵ / ⌘R)"}
                  >
                    <span>{hasSelection ? 'Run Selection' : 'Run Current'}</span>
                    <kbd className="text-[10px] opacity-70 font-mono">⌘↵</kbd>
                  </button>
                  <div className="h-3 w-px bg-slate-300 dark:bg-white/10" />
                  <button
                    onClick={() => setIsRunMenuOpen(!isRunMenuOpen)}
                    className="px-1.5 py-0.5 flex items-center justify-center cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                    title="Run Options (Run All, Run Current)"
                  >
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>
                </div>

                {isRunMenuOpen && (
                  <div className="absolute right-0 top-7.5 w-52 bg-white dark:bg-[#1f2023] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 py-1 text-slate-800 dark:text-slate-200 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={handleRunAll}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer group"
                    >
                      <span className="font-medium">Run All</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 group-hover:bg-sky-700 group-hover:text-white rounded text-[10px] font-mono text-slate-500 dark:text-slate-400">⇧⌘↵</kbd>
                    </button>
                    <button
                      onClick={handleRun}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer group"
                    >
                      <span className="font-medium">Run Current</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 group-hover:bg-sky-700 group-hover:text-white rounded text-[10px] font-mono text-slate-500 dark:text-slate-400">⌘↵</kbd>
                    </button>
                    {hasSelection && (
                      <button
                        onClick={handleRun}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer group"
                      >
                        <span className="font-medium">Run Selection</span>
                        <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 group-hover:bg-sky-700 group-hover:text-white rounded text-[10px] font-mono text-slate-500 dark:text-slate-400">⌘↵</kbd>
                      </button>
                    )}
                    <div className="my-1 border-t border-slate-200 dark:border-slate-700/80" />
                    <button
                      onClick={() => {
                        setIsRunMenuOpen(false);
                        handleFormat();
                      }}
                      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer group"
                    >
                      <span className="font-medium">Format SQL</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 group-hover:bg-sky-700 group-hover:text-white rounded text-[10px] font-mono text-slate-500 dark:text-slate-400">⌘I</kbd>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draggable Horizontal Splitter Handle between Editor and Results */}
      {!isSqlResultsCollapsed && (
        <div
          onMouseDown={handleSplitterResizeStart}
          onDoubleClick={() => setSqlEditorSplitHeight(220)}
          className="h-1 hover:h-1.5 bg-slate-200 dark:bg-slate-800/80 hover:bg-sky-500/60 active:bg-sky-500 cursor-row-resize transition-all duration-100 relative group flex-shrink-0 z-20 select-none"
          title="Drag to resize SQL editor & results • Double-click to reset (220px)"
        >
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 -bottom-1 w-12 rounded-full bg-sky-400/0 group-hover:bg-sky-400/40 transition-colors pointer-events-none flex items-center justify-center">
            <div className="h-0.5 w-6 bg-sky-400 rounded-full opacity-0 group-hover:opacity-100" />
          </div>
        </div>
      )}

      {/* Bottom Split: Query Result Grid (Collapsible & Resizable) */}
      {!isSqlResultsCollapsed ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#121315] select-text relative">
          {/* Multi-Query Results Sub-Tabs (TablePlus style: Query 1 📌, Query 2, Query 3, Query 4) */}
          <div className="h-8 bg-slate-100 dark:bg-[#1f2023] border-b border-slate-300 dark:border-white/10 px-2 flex items-center space-x-1 overflow-x-auto select-none flex-shrink-0">
            {queryItems.map((qItem, idx) => {
              const isActive = qItem.id === (tabState.activeResultId || queryItems[0].id);
              return (
                <React.Fragment key={qItem.id}>
                  {idx > 0 && !isActive && queryItems[idx - 1]?.id !== (tabState.activeResultId || queryItems[0].id) && (
                    <div className="h-3 w-px bg-slate-300 dark:bg-white/15 my-auto shrink-0" />
                  )}
                  <div
                    onClick={() => {
                      setActiveQueryResultTab(activeTabId, qItem.id);
                      if (qItem.status === 'error') {
                        setResultsSubTab('message');
                      }
                    }}
                    className={`group h-6.5 px-3 rounded-md text-[11px] font-medium transition flex items-center space-x-2 cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-slate-300 dark:bg-[#525357] text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-[#9a9b9f] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'
                    }`}
                  >
                    {/* Close Tab Button */}
                    {queryItems.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeQueryResultTab(activeTabId, qItem.id);
                        }}
                        className="w-3.5 h-3.5 rounded hover:bg-black/20 dark:hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer -ml-1"
                        title="Close tab"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}

                    {/* Status Dot */}
                    {qItem.status === 'running' ? (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                    ) : qItem.status === 'error' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    ) : null}

                    {/* Title */}
                    <span>{qItem.title || `Query ${idx + 1}`}</span>

                    {/* Pin Tab Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinQueryResultTab(activeTabId, qItem.id);
                      }}
                      className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/20 transition cursor-pointer"
                      title={qItem.isPinned ? 'Unpin tab' : 'Pin tab'}
                    >
                      <Pin
                        className={`w-3 h-3 transition-transform ${
                          qItem.isPinned
                            ? 'text-amber-500 fill-amber-500 rotate-45'
                            : 'text-slate-400/40 hover:text-slate-600 dark:text-white/30 dark:hover:text-white group-hover:opacity-100 opacity-40'
                        }`}
                      />
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Search Filter Bar (if toggled via Search button) */}
          {isSearchOpen && (
            <div className="h-7 bg-slate-50 dark:bg-[#18191c] border-b border-slate-200 dark:border-white/10 px-3 flex items-center space-x-2 text-xs select-none">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter results across columns..."
                className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-xs flex-1 placeholder:text-slate-400 font-mono"
                autoFocus
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Main Results View: Data | Message | Chart | Loading */}
          <div className="flex-1 overflow-auto relative">
            {tabState.isExecuting ? (
              /* Zebra Skeleton Loading Grid (TablePlus Screenshot 5) */
              <div className="w-full h-full overflow-auto bg-white dark:bg-[#141517] font-mono text-xs select-none">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-[#1a1b1e] border-b border-slate-300 dark:border-slate-800 text-slate-500 text-left text-[11px]">
                    <tr>
                      <th className="w-12 p-2 border-r border-slate-300 dark:border-slate-800 text-center">#</th>
                      <th className="p-2 border-r border-slate-300 dark:border-slate-800 min-w-[140px]">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-20 animate-pulse" />
                      </th>
                      <th className="p-2 border-r border-slate-300 dark:border-slate-800 min-w-[200px]">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-32 animate-pulse" />
                      </th>
                      <th className="p-2 border-r border-slate-300 dark:border-slate-800 min-w-[120px]">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-16 animate-pulse" />
                      </th>
                      <th className="p-2 min-w-[160px]">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-24 animate-pulse" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
                    {Array.from({ length: 12 }).map((_, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? 'bg-slate-50/50 dark:bg-[#16171a]' : 'bg-white dark:bg-[#121315]'}
                      >
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-800/60">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16 animate-pulse" />
                        </td>
                        <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-800/60">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-44 animate-pulse" />
                        </td>
                        <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-800/60">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12 animate-pulse" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-28 animate-pulse" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : resultsSubTab === 'message' || (isErrorResult && resultsSubTab !== 'chart') ? (
              /* Message View (Matches TablePlus Screenshots 1 & 4) */
              <div className="w-full h-full p-4 overflow-auto bg-white dark:bg-[#161719] font-mono text-xs select-text">
                {isErrorResult ? (
                  <div className="space-y-3 font-mono">
                    <div className="text-red-500 font-bold leading-relaxed whitespace-pre-wrap text-xs">
                      {activeResultItem?.statusMessage || `Query ERROR: ${activeResultItem?.error || tabState.error || 'Execution failed'}`}
                    </div>
                    {activeResultItem?.query && (
                      <div className="space-y-1 pt-2">
                        <span className="text-[11px] text-slate-400 font-sans uppercase font-semibold">Executed Statement</span>
                        <pre className="p-3 bg-slate-100 dark:bg-[#1b1c1f] border border-slate-300 dark:border-white/5 text-slate-700 dark:text-slate-300 rounded-lg whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                          {activeResultItem.query}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 text-slate-800 dark:text-slate-200 font-mono text-xs">
                    <div className="text-slate-900 dark:text-slate-100 font-bold text-xs tracking-wide">
                      {activeResultItem?.statusMessage || `Query OK: ${results.length} rows returned`}
                    </div>
                    {activeResultItem?.query && (
                      <div className="pt-2">
                        <pre className="p-3 bg-slate-100 dark:bg-[#1b1c1f] border border-slate-300 dark:border-white/5 text-slate-700 dark:text-slate-300 rounded-lg whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                          {activeResultItem.query}
                        </pre>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 dark:text-[#6a6b70] pt-1">
                      -- {activeResultItem?.executedAt || '2026-10-23 09:42:25.0000'}
                      <br />
                      END;
                    </div>
                  </div>
                )}
              </div>
            ) : resultsSubTab === 'history' ? (
              <QueryHistoryPanel
                onRunQuery={(sql) => runSqlQuery(activeTabId, sql)}
                onInsertQuery={handleSendToEditor}
              />
            ) : resultsSubTab === 'chart' ? (
              <QueryChartView results={results} columns={columns} />
            ) : (
              /* Data Results Table */
              <div className="w-full h-full overflow-auto text-xs font-mono bg-white dark:bg-transparent">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 text-left text-[11px]">
                    <tr>
                      <th className="w-12 p-2 border-r border-slate-300 dark:border-slate-800/80 text-center text-slate-500 dark:text-slate-600 font-bold">#</th>
                      {columns.map((col) => {
                        const isErrorCol = col.toLowerCase() === 'error';
                        const meta = colMetaMap[col];

                        return (
                          <th key={col} className={`p-2 border-r border-slate-300 dark:border-slate-800/80 font-semibold min-w-[120px] ${
                            isErrorCol ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            <div className="flex items-center space-x-1.5 truncate">
                              {isErrorCol ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              ) : (
                                <ColumnTypeIcon type={meta?.foundType} sampleValue={meta?.sampleVal} />
                              )}
                              <span className={`font-semibold truncate ${isErrorCol ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>{col}</span>
                              {meta?.isPk && (
                                <span title="Primary Key" className="inline-flex items-center ml-0.5">
                                  <Key className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400/90 flex-shrink-0" />
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 text-[11px]">
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="py-8 text-center text-slate-500">
                          No records returned from query execution.
                        </td>
                      </tr>
                    ) : (
                      paginatedSqlResults.map((r, pageIdx) => {
                        const index = safeSqlPage * SQL_PAGE_SIZE + pageIdx;
                        const rowId = r.id !== undefined ? r.id : `row-${index}`;
                        const isSelected = selectedRowIds.has(rowId);
                        const isEven = index % 2 === 0;

                        return (
                          <tr
                            key={rowId}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey) {
                                const next = new Set(selectedRowIds);
                                if (next.has(rowId)) next.delete(rowId);
                                else next.add(rowId);
                                setSelectedRowIds(next);
                              } else {
                                setSelectedRowIds(new Set([rowId]));
                              }
                              setSelectedRowData(r);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenuRows([r]);
                              setSelectedRowIds(new Set([rowId]));
                              setSelectedRowData(r);
                              setContextMenuPos({ x: e.clientX, y: e.clientY });
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#eff6ff] dark:bg-sky-600/30 text-[#1d4ed8] dark:text-white font-medium shadow-2xs border-y border-[#dbeafe] dark:border-sky-500/30'
                                : isEven
                                ? 'bg-[#fcfdfd] dark:bg-slate-900/40 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                                : 'bg-white dark:bg-slate-950/60 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <td className="p-2 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 select-none font-medium align-top">
                              {index + 1}
                            </td>
                            {columns.map((col) => {
                              const val = r[col];
                              const editKey = `${rowId}:${col}`;
                              const isDirty = pendingEdits[editKey] !== undefined;
                              const isEditing = editingCell?.rowId === rowId && editingCell?.col === col;
                              const isErrorCol = col.toLowerCase() === 'error';
                              const shouldWrap = wrapText || isErrorCol;

                              if (isEditing) {
                                const colDef = colMetaMap[col]?.colDef || {
                                  name: col,
                                  type: inferColumnType(val, col),
                                  isPrimaryKey: col.toLowerCase() === 'id',
                                  isNullable: true,
                                };
                                return (
                                  <td
                                    key={col}
                                    className="p-0 border-r border-slate-200 dark:border-slate-800/60 relative overflow-visible z-20"
                                  >
                                    <InlineCellEditor
                                      col={colDef}
                                      initialValue={val}
                                      onSave={(newVal) => handleSaveCell(rowId, index, col, newVal, r)}
                                      onCancel={() => setEditingCell(null)}
                                    />
                                  </td>
                                );
                              }

                              return (
                                <td 
                                  key={col} 
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEditing(rowId, index, col);
                                  }}
                                  className={`px-3 py-2 border-r border-slate-200 dark:border-slate-800/60 select-text relative transition-colors ${
                                    isDirty
                                      ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-900 dark:text-amber-100 font-medium'
                                      : ''
                                  } ${
                                    shouldWrap
                                      ? 'whitespace-pre-wrap break-words leading-relaxed'
                                      : 'whitespace-nowrap overflow-hidden text-ellipsis max-w-md'
                                  } ${isErrorCol ? 'bg-rose-50/40 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 font-mono' : ''}`}
                                  title={val ? String(val) : undefined}
                                >
                                  {/* Dirty indicator dot */}
                                  {isDirty && (
                                    <span
                                      className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full shadow-xs ring-1 ring-amber-600/30"
                                      title="Cell modified. Press ⌘S or click 'Review & Execute SQL' to apply."
                                    />
                                  )}

                                  {val === null || val === undefined ? (
                                    <span className="text-slate-400 dark:text-slate-500 italic select-none font-mono">NULL</span>
                                  ) : typeof val === 'boolean' ? (
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">{val ? 'TRUE' : 'FALSE'}</span>
                                  ) : typeof val === 'object' ? (
                                    <span className={`font-mono text-slate-700 dark:text-slate-300 ${shouldWrap ? 'whitespace-pre-wrap break-words' : 'truncate block'}`}>
                                      {JSON.stringify(val, null, shouldWrap ? 2 : undefined)}
                                    </span>
                                  ) : isErrorCol ? (
                                    <div className="flex items-start space-x-2 text-rose-700 dark:text-rose-300">
                                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                      <span className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed select-text flex-1">
                                        {String(val)}
                                      </span>
                                    </div>
                                  ) : shouldWrap ? (
                                    <span className="whitespace-pre-wrap break-words block text-slate-800 dark:text-slate-200 leading-relaxed font-mono">{String(val)}</span>
                                  ) : (
                                    <span className="truncate block text-slate-800 dark:text-slate-200 font-mono">{String(val)}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* TablePlus Bottom Status Bar */}
          <div className="h-8 bg-slate-50 dark:bg-[#1a1b1e] border-t border-slate-200 dark:border-white/10 px-3 flex items-center justify-between text-xs select-none flex-shrink-0">
            {/* Left: Segmented Data | Message | Chart */}
            <div className="flex items-center space-x-3">
              <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 dark:bg-[#25262a] text-xs font-medium border border-slate-300/60 dark:border-white/5">
                <button
                  onClick={() => setResultsSubTab('data')}
                  className={`px-3 py-0.5 rounded-md transition cursor-pointer ${
                    resultsSubTab === 'data' && !isErrorResult
                      ? 'bg-[#007aff] text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-[#9a9b9f] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Data
                </button>
                <button
                  onClick={() => setResultsSubTab('message')}
                  className={`px-3 py-0.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
                    resultsSubTab === 'message' || isErrorResult
                      ? 'bg-[#007aff] text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-[#9a9b9f] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>Message</span>
                  {isErrorResult && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                </button>
                <button
                  onClick={() => setResultsSubTab('history')}
                  className={`px-3 py-0.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
                    resultsSubTab === 'history'
                      ? 'bg-[#007aff] text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-[#9a9b9f] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>History</span>
                  {history.length > 0 && (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded-full bg-black/20 dark:bg-white/20">
                      {history.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setResultsSubTab('chart')}
                  className={`px-3 py-0.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
                    resultsSubTab === 'chart'
                      ? 'bg-[#007aff] text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-[#9a9b9f] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <BarChart2 className="w-3 h-3" />
                  <span>Chart</span>
                </button>
              </div>

              {/* Middle Status text (Matches TablePlus Screenshots 1, 2, 4) */}
              {tabState.isExecuting ? (
                <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 font-mono text-[11px] font-semibold animate-pulse">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Waiting: {waitingSeconds.toFixed(1)} s</span>
                </div>
              ) : isErrorResult ? (
                <div className="flex items-center space-x-3 font-mono text-[11px]">
                  <span className="text-slate-500 dark:text-[#9a9b9f]">{activeDuration || 119} ms</span>
                  <span className="text-rose-500 font-semibold">Error</span>
                </div>
              ) : (
                <div className="flex items-center space-x-3 text-slate-500 dark:text-[#9a9b9f] font-mono text-[11px]">
                  <span>{activeDuration || 80} ms</span>
                  <span>
                    {activeResultItem?.statusMessage ||
                      `Query ${queryItems.findIndex(q => q.id === (tabState.activeResultId || queryItems[0].id)) + 1} OK: ${results.length} rows`}
                  </span>
                </div>
              )}

              {/* Pending Inline Edits Indicator Pill (⌘S to directly apply or review) */}
              {Object.keys(pendingEdits).length > 0 && (
                <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-medium text-[11px] animate-in fade-in duration-150">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>{Object.keys(pendingEdits).length} modified</span>
                  <span className="text-slate-400">·</span>
                  <button
                    onClick={handleDiscardPendingEdits}
                    className="hover:underline text-rose-600 dark:text-rose-400 cursor-pointer"
                    title="Discard all pending cell changes"
                  >
                    Discard
                  </button>
                  <span className="text-slate-400">·</span>
                  <button
                    disabled={isApplyingDirect}
                    onClick={handleDirectApplyPendingEdits}
                    className="hover:underline font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    title="Commit & Apply cell changes directly to database (⌘S)"
                  >
                    {isApplyingDirect ? (
                      <div className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    )}
                    <span>Apply Changes</span>
                    <kbd className="px-1 py-0.2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-mono">⌘S</kbd>
                  </button>
                  <span className="text-slate-400">·</span>
                  <button
                    onClick={() => setIsQueryEditModalOpen(true)}
                    className="hover:underline text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer text-[11px]"
                    title="Review SQL diff & customize statement"
                  >
                    Review SQL...
                  </button>
                </div>
              )}
            </div>

            {/* Right: Pagination, Pin, Search, Export..., Wrap, Split controls */}
            <div className="flex items-center space-x-2 text-xs">
              {totalSqlPages > 1 && resultsSubTab === 'data' && (
                <div className="flex items-center space-x-0.5 pr-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  <button
                    onClick={() => setSqlPage((p) => Math.max(0, p - 1))}
                    disabled={safeSqlPage <= 0}
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                    title="Previous 200 rows"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span>
                    {safeSqlPage + 1}/{totalSqlPages}
                  </span>
                  <button
                    onClick={() => setSqlPage((p) => Math.min(totalSqlPages - 1, p + 1))}
                    disabled={safeSqlPage >= totalSqlPages - 1}
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                    title="Next 200 rows"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
              {/* Pin Tab Button */}
              <button
                onClick={() => {
                  if (activeResultItem) {
                    togglePinQueryResultTab(activeTabId, activeResultItem.id);
                  }
                }}
                className={`h-6 w-6 rounded bg-slate-200/80 dark:bg-[#2c2d30] hover:bg-slate-300 dark:hover:bg-[#38393d] border border-slate-300 dark:border-white/5 flex items-center justify-center transition cursor-pointer ${
                  activeResultItem?.isPinned
                    ? 'text-amber-500'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={activeResultItem?.isPinned ? 'Unpin this query tab' : 'Pin this query tab'}
              >
                <Pin className={`w-3 h-3 ${activeResultItem?.isPinned ? 'fill-amber-500 rotate-45' : ''}`} />
              </button>

              {/* Search Button */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`h-6 w-6 rounded border transition cursor-pointer flex items-center justify-center ${
                  isSearchOpen || searchFilter
                    ? 'bg-sky-500 text-white border-sky-400'
                    : 'bg-slate-200/80 dark:bg-[#2c2d30] hover:bg-slate-300 dark:hover:bg-[#38393d] border-slate-300 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Filter results"
              >
                <Search className="w-3 h-3" />
              </button>

              {/* Export... Split Button */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  className="h-6 px-2.5 rounded bg-slate-200/80 dark:bg-[#2c2d30] hover:bg-slate-300 dark:hover:bg-[#38393d] border border-slate-300 dark:border-white/5 flex items-center space-x-1 text-slate-700 dark:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                  title="Export results (CSV, JSON, SQL)"
                >
                  <span>Export...</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {isExportMenuOpen && (
                  <div className="absolute right-0 bottom-7.5 w-48 bg-white dark:bg-[#1f2023] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 py-1 text-slate-800 dark:text-slate-200 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Export as CSV (.csv)</span>
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Export as JSON (.json)</span>
                    </button>
                    <button
                      onClick={() => handleExport('sql')}
                      className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-sky-500 hover:text-white dark:hover:bg-sky-600 transition text-left cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Export as SQL Insert (.sql)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Wrap text toggle */}
              <button
                onClick={() => {
                  setWrapText(!wrapText);
                  showToast(wrapText ? 'Single line view (Wrap off)' : 'Auto line wrap enabled (Wrap on)');
                }}
                className={`h-6 px-1.5 rounded transition-all flex items-center space-x-1 cursor-pointer select-none text-[10px] ${
                  wrapText
                    ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 font-semibold'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'
                }`}
                title={wrapText ? 'Disable wrapping' : 'Enable wrapping'}
              >
                <WrapText className="w-2.5 h-2.5" />
                <span>{wrapText ? 'Wrap: On' : 'Wrap: Off'}</span>
              </button>

              <div className="h-3 w-px bg-slate-300 dark:bg-slate-700" />

              {/* Maximize / Collapse */}
              <button
                onClick={() => setSqlEditorSplitHeight(sqlEditorSplitHeight <= 100 ? 220 : 80)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
                title={sqlEditorSplitHeight <= 100 ? 'Restore Split' : 'Maximize Results'}
              >
                {sqlEditorSplitHeight <= 100 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </button>
              <button
                onClick={toggleSqlResultsCollapsed}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                title="Collapse Results Panel"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Bottom Console Log Drawer (TablePlus Screenshots) */}
          {isConsoleDrawerOpen && (
            <div className="h-20 bg-slate-900 dark:bg-[#141517] border-t border-slate-300 dark:border-white/10 flex flex-col font-mono text-xs select-text flex-shrink-0">
              <div className="flex-1 p-2 overflow-auto text-slate-300 dark:text-slate-300 text-[11px] leading-relaxed">
                {activeResultItem?.query ? (
                  <>
                    <div className="whitespace-pre-wrap">{activeResultItem.query}</div>
                    <div className="text-slate-500 mt-1">-- {activeResultItem.executedAt || '2026-10-23 09:42:25.0000'}</div>
                    <div className="text-slate-500">END;</div>
                  </>
                ) : (
                  <div className="text-slate-500 text-center py-2">Console log, please execute a query or select a table to see the log</div>
                )}
              </div>
              <div className="h-5.5 bg-slate-950 dark:bg-[#1a1b1e] border-t border-slate-800 dark:border-white/5 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => showToast('Cleared console log')}
                    className="hover:text-slate-200 transition cursor-pointer p-0.5"
                    title="Clear log"
                  >
                    <Trash2 className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                  </button>
                  <label className="flex items-center space-x-1.5 cursor-pointer text-[10px] text-slate-400 hover:text-slate-200">
                    <input
                      type="checkbox"
                      checked={enableSyntaxHighlighting}
                      onChange={(e) => setEnableSyntaxHighlighting(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-sky-500 text-[10px]"
                    />
                    <span>Enable syntax highlighting</span>
                  </label>
                </div>
                <button
                  onClick={() => setIsConsoleDrawerOpen(false)}
                  className="hover:text-slate-200 transition cursor-pointer p-0.5 text-[10px] text-slate-500 hover:text-slate-300"
                  title="Hide console"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Collapsed Query Results Bottom Bar */
        <div className="h-8 bg-slate-950 border-t border-slate-800/80 px-4 flex items-center justify-between text-xs select-none flex-shrink-0">
          <div className="flex items-center space-x-2 text-slate-400 font-mono text-[11px]">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>Query Results: {results.length} rows (Collapsed)</span>
          </div>
          <button
            onClick={toggleSqlResultsCollapsed}
            className="px-2.5 py-1 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 rounded-md text-[11px] font-semibold transition active:scale-95 cursor-pointer flex items-center space-x-1"
          >
            <ChevronUp className="w-3 h-3" />
            <span>Expand Results</span>
          </button>
        </div>
      )}

      {/* Right-Click Context Menu for Results */}
      <TableContextMenu
        position={contextMenuPos}
        selectedRows={
          contextMenuRows.length > 0
            ? contextMenuRows
            : selectedRowIds.size > 0
            ? results.filter((r, idx) => selectedRowIds.has(r.id !== undefined ? r.id : idx))
            : results[0]
            ? [results[0]]
            : []
        }
        tableName="query_results"
        onClose={() => {
          setContextMenuPos(null);
          setContextMenuRows([]);
        }}
        onDuplicateRow={() => {}}
        onDeleteRows={() => {}}
        onQuickLook={(row) => setInspectingRow(row)}
        onToast={showToast}
      />

      {/* Quick Look Inspector Dialog */}
      {inspectingRow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-100">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 flex flex-col animate-in zoom-in-95 duration-100">
            <div className="h-10 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between select-none">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-slate-100">Quick Look — Row #{inspectingRow.id}</span>
              </div>
              <button
                onClick={() => setInspectingRow(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="p-4 max-h-[420px] overflow-auto font-mono text-xs text-sky-300 bg-slate-950 select-text">
              {JSON.stringify(inspectingRow, null, 2)}
            </pre>
            <div className="h-11 bg-slate-950 border-t border-slate-800 px-4 flex items-center justify-end select-none">
              <button
                onClick={() => setInspectingRow(null)}
                className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Code Editor Context Menu */}
      {editorContextPos && (
        <ContextMenuContainer
          position={editorContextPos}
          onClose={() => setEditorContextPos(null)}
          width={240}
        >
          <ContextMenuHeader title="SQL Editor" />
          <ContextMenuItem
            icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
            label="Run Current Query"
            shortcut="⌘↵"
            onClick={() => {
              handleRun();
              setEditorContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Play className="w-3.5 h-3.5 text-teal-400" />}
            label="Run All Queries"
            shortcut="⇧⌘↵"
            onClick={() => {
              handleRunAll();
              setEditorContextPos(null);
            }}
          />
          {hasSelection && (
            <ContextMenuItem
              icon={<Play className="w-3.5 h-3.5 text-sky-400" />}
              label="Run Selected Query"
              onClick={() => {
                handleRun();
                setEditorContextPos(null);
              }}
            />
          )}
          <ContextMenuItem
            icon={<Sparkles className="w-3.5 h-3.5 text-sky-400" />}
            label="Format SQL"
            shortcut="⇧⌥F"
            onClick={() => {
              handleFormat();
              setEditorContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Check className="w-3.5 h-3.5 text-slate-400" />}
            label="Select All"
            shortcut="⌘A"
            onClick={() => {
              if (viewRef.current) {
                viewRef.current.dispatch({
                  selection: { anchor: 0, head: viewRef.current.state.doc.length },
                });
              }
              setEditorContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy"
            shortcut="⌘C"
            onClick={() => {
              if (viewRef.current) {
                const { from, to } = viewRef.current.state.selection.main;
                const text = from !== to ? viewRef.current.state.sliceDoc(from, to) : viewRef.current.state.doc.toString();
                navigator.clipboard.writeText(text);
                showToast('📋 Copied to clipboard');
              }
              setEditorContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Scissors className="w-3.5 h-3.5 text-slate-400" />}
            label="Cut"
            shortcut="⌘X"
            onClick={() => {
              if (viewRef.current) {
                const { from, to } = viewRef.current.state.selection.main;
                if (from !== to) {
                  const text = viewRef.current.state.sliceDoc(from, to);
                  navigator.clipboard.writeText(text);
                  viewRef.current.dispatch({ changes: { from, to, insert: '' } });
                  showToast('✂️ Cut selection');
                }
              }
              setEditorContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Trash className="w-3.5 h-3.5 text-slate-400" />}
            label="Clear Editor"
            onClick={() => {
              if (viewRef.current) {
                viewRef.current.dispatch({
                  changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' },
                });
                setSqlTabQuery(activeTabId, '');
                showToast('🧹 Cleared editor');
              }
              setEditorContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
            label="Explain Query (EXPLAIN ANALYZE)"
            onClick={() => {
              if (viewRef.current) {
                const currentDoc = viewRef.current.state.doc.toString();
                const explainQuery = currentDoc.trim().toLowerCase().startsWith('explain')
                  ? currentDoc
                  : `EXPLAIN ANALYZE\n${currentDoc}`;
                viewRef.current.dispatch({
                  changes: { from: 0, to: viewRef.current.state.doc.length, insert: explainQuery },
                });
                setSqlTabQuery(activeTabId, explainQuery);
                runSqlQuery(activeTabId, explainQuery);
                showToast('⚡ Running EXPLAIN ANALYZE...');
              }
              setEditorContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}

      {/* Review & Execute Generated UPDATE Statement Modal */}
      <QueryEditUpdateModal
        isOpen={isQueryEditModalOpen}
        onClose={() => setIsQueryEditModalOpen(false)}
        pendingEdits={pendingEdits}
        activeConnection={activeConnection}
        onApplySuccess={handleApplySuccess}
        onDiscard={handleDiscardPendingEdits}
        onShowToast={showToast}
        onSendToEditor={handleSendToEditor}
      />
    </div>
  );
};
