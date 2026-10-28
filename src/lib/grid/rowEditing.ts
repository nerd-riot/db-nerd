import type { GridRow } from '../../types/index.ts';
import { cloneGridRows } from '../memory/memoryGuard.ts';

export interface GridMutationResult {
  rows: GridRow[];
  selectedRowData: GridRow | null;
  pendingEditsCount: number;
  isTransactionOpen: boolean;
}

/**
 * Counts all pending uncommitted edits in rows (inserted, deleted, or dirty cells).
 */
export function countDirtyEdits(rows: GridRow[]): number {
  let count = 0;
  for (const r of rows) {
    if (r.rowState === 'inserted' || r.rowState === 'deleted') {
      count++;
    } else if (r.dirtyFields) {
      count += Object.keys(r.dirtyFields).length;
    }
  }
  return count;
}

/**
 * Applies an inline or inspector cell edit to rows and synchronizes selectedRowData.
 */
export function applyCellUpdate(
  rows: GridRow[],
  originalRows: GridRow[],
  selectedRowData: GridRow | null,
  id: number | string,
  field: string,
  value: any,
  extraPendingCount: number = 0
): GridMutationResult {
  const origRow = originalRows.find((r) => String(r.id) === String(id));

  let castValue = value;
  if (field === 'id' || field === 'user_id' || field === 'total_amount') {
    const num = Number(value);
    if (!isNaN(num)) castValue = num;
  }

  let nextSelectedRow = selectedRowData;
  const updatedRows = rows.map((r) => {
    if (String(r.id) !== String(id)) return r;

    const currentDirty = { ...(r.dirtyFields || {}) };
    const isOriginal = origRow ? JSON.stringify(origRow[field]) === JSON.stringify(castValue) : false;

    if (isOriginal) {
      delete currentDirty[field];
    } else {
      currentDirty[field] = true;
    }

    const hasDirtyFields = Object.keys(currentDirty).length > 0;
    const nextRowState: GridRow['rowState'] =
      r.rowState === 'inserted' ? 'inserted' : hasDirtyFields ? 'modified' : 'clean';

    const updatedRow: GridRow = {
      ...r,
      [field]: castValue,
      dirtyFields: currentDirty,
      isDirty: hasDirtyFields || r.rowState === 'inserted' || r.rowState === 'deleted',
      rowState: nextRowState,
    };

    if (selectedRowData && String(selectedRowData.id) === String(id)) {
      nextSelectedRow = updatedRow;
    }

    return updatedRow;
  });

  const dirtyCount = countDirtyEdits(updatedRows) + extraPendingCount;

  return {
    rows: updatedRows,
    selectedRowData: nextSelectedRow,
    pendingEditsCount: dirtyCount,
    isTransactionOpen: dirtyCount > 0,
  };
}

/**
 * Reverts a single field on a row back to its original state.
 */
export function applyCellRevert(
  rows: GridRow[],
  originalRows: GridRow[],
  selectedRowData: GridRow | null,
  id: number | string,
  field: string,
  extraPendingCount: number = 0
): GridMutationResult {
  const origRow = originalRows.find((r) => String(r.id) === String(id));
  if (!origRow) {
    const dirtyCount = countDirtyEdits(rows) + extraPendingCount;
    return {
      rows,
      selectedRowData,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: dirtyCount > 0,
    };
  }

  const originalVal = origRow[field];
  let nextSelected = selectedRowData;

  const updatedRows = rows.map((r) => {
    if (String(r.id) !== String(id)) return r;

    const currentDirty = { ...(r.dirtyFields || {}) };
    delete currentDirty[field];

    const hasDirtyFields = Object.keys(currentDirty).length > 0;
    const nextRowState: GridRow['rowState'] =
      r.rowState === 'inserted' ? 'inserted' : hasDirtyFields ? 'modified' : 'clean';

    const reverted: GridRow = {
      ...r,
      [field]: originalVal,
      dirtyFields: currentDirty,
      isDirty: hasDirtyFields || r.rowState === 'inserted' || r.rowState === 'deleted',
      rowState: nextRowState,
    };

    if (selectedRowData && String(selectedRowData.id) === String(id)) {
      nextSelected = reverted;
    }

    return reverted;
  });

  const dirtyCount = countDirtyEdits(updatedRows) + extraPendingCount;

  return {
    rows: updatedRows,
    selectedRowData: nextSelected,
    pendingEditsCount: dirtyCount,
    isTransactionOpen: dirtyCount > 0,
  };
}

/**
 * Reverts all modified fields on a single row back to its clean original state.
 */
export function applyRowRevert(
  rows: GridRow[],
  originalRows: GridRow[],
  selectedRowData: GridRow | null,
  id: number | string,
  extraPendingCount: number = 0
): GridMutationResult {
  const origRow = originalRows.find((r) => String(r.id) === String(id));
  if (!origRow) {
    const dirtyCount = countDirtyEdits(rows) + extraPendingCount;
    return {
      rows,
      selectedRowData,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: dirtyCount > 0,
    };
  }

  let nextSelected = selectedRowData;
  const updatedRows = rows.map((r) => {
    if (String(r.id) !== String(id)) return r;

    const restored: GridRow = {
      ...origRow,
      isDirty: false,
      dirtyFields: {},
      rowState: 'clean',
    };

    if (selectedRowData && String(selectedRowData.id) === String(id)) {
      nextSelected = restored;
    }

    return restored;
  });

  const dirtyCount = countDirtyEdits(updatedRows) + extraPendingCount;

  return {
    rows: updatedRows,
    selectedRowData: nextSelected,
    pendingEditsCount: dirtyCount,
    isTransactionOpen: dirtyCount > 0,
  };
}

/**
 * Rollback all uncommitted changes across all rows in the active transaction,
 * restoring original rows and resetting selectedRowData to original state.
 */
export function applyTransactionRollback(
  originalRows: GridRow[],
  selectedRowData: GridRow | null
): GridMutationResult {
  const restoredRows = cloneGridRows(originalRows);
  let restoredSelectedRow = selectedRowData;

  if (selectedRowData) {
    const orig = originalRows.find((r) => String(r.id) === String(selectedRowData.id));
    if (orig) {
      restoredSelectedRow = {
        ...orig,
        isDirty: false,
        dirtyFields: {},
        rowState: 'clean',
      };
    }
  }

  return {
    rows: restoredRows,
    selectedRowData: restoredSelectedRow,
    pendingEditsCount: 0,
    isTransactionOpen: false,
  };
}
