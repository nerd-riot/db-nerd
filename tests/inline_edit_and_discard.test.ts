import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCellUpdate,
  applyCellRevert,
  applyRowRevert,
  applyTransactionRollback,
  countDirtyEdits,
} from '../src/lib/grid/rowEditing.ts';
import type { GridRow } from '../src/types/index.ts';

describe('Inline Editing & Discard / Rollback State Engine', () => {
  const initialRows: GridRow[] = [
    {
      id: 1,
      name: 'Alpha Record',
      action: 'view',
      status: 'active',
      isDirty: false,
      rowState: 'clean',
    },
    {
      id: 2,
      name: 'Beta Record',
      action: 'edit',
      status: 'pending',
      isDirty: false,
      rowState: 'clean',
    },
    {
      id: 'uuid-1234-abcd',
      name: 'Gamma Record (UUID)',
      action: 'delete',
      status: 'active',
      isDirty: false,
      rowState: 'clean',
    },
  ];

  const getCleanData = () => ({
    originalRows: JSON.parse(JSON.stringify(initialRows)) as GridRow[],
    rows: JSON.parse(JSON.stringify(initialRows)) as GridRow[],
    selectedRowData: JSON.parse(JSON.stringify(initialRows[0])) as GridRow,
  });

  it('marks cell dirty and synchronizes selectedRowData when updating a field', () => {
    const { rows, originalRows, selectedRowData } = getCleanData();

    const res = applyCellUpdate(rows, originalRows, selectedRowData, 1, 'action', 'fo');

    const row1 = res.rows.find((r) => r.id === 1);
    assert.ok(row1);
    assert.equal(row1.action, 'fo');
    assert.equal(row1.isDirty, true);
    assert.equal(row1.dirtyFields?.action, true);
    assert.equal(row1.rowState, 'modified');
    assert.equal(res.pendingEditsCount, 1);
    assert.equal(res.isTransactionOpen, true);

    // SelectedRowData in Right Inspector must also update to 'fo' and mark dirty
    assert.ok(res.selectedRowData);
    assert.equal(res.selectedRowData.action, 'fo');
    assert.equal(res.selectedRowData.isDirty, true);
    assert.equal(res.selectedRowData.dirtyFields?.action, true);
  });

  it('reverts a single field with applyCellRevert and restores original value in rows and selectedRowData', () => {
    const { rows, originalRows, selectedRowData } = getCleanData();

    // 1. User types 'fo' into 'action' field
    const editRes = applyCellUpdate(rows, originalRows, selectedRowData, 1, 'action', 'fo');
    assert.equal(editRes.pendingEditsCount, 1);
    assert.equal(editRes.rows.find((r) => r.id === 1)?.action, 'fo');

    // 2. User clicks Discard on that field or presses Escape in the field
    const revertRes = applyCellRevert(
      editRes.rows,
      originalRows,
      editRes.selectedRowData,
      1,
      'action'
    );

    const row1 = revertRes.rows.find((r) => r.id === 1);
    assert.ok(row1);
    assert.equal(row1.action, 'view'); // restored to original
    assert.equal(row1.isDirty, false);
    assert.equal(row1.dirtyFields?.action, undefined);
    assert.equal(row1.rowState, 'clean');
    assert.equal(revertRes.pendingEditsCount, 0);
    assert.equal(revertRes.isTransactionOpen, false);

    // Inspector selectedRowData must be reverted as well (no more lingering 'fo')
    assert.equal(revertRes.selectedRowData?.action, 'view');
    assert.equal(revertRes.selectedRowData?.isDirty, false);
  });

  it('supports string/UUID row IDs for inline editing and single field revert', () => {
    const { rows, originalRows } = getCleanData();
    const selectedRowData = JSON.parse(JSON.stringify(initialRows[2])); // row with UUID

    const editRes = applyCellUpdate(
      rows,
      originalRows,
      selectedRowData,
      'uuid-1234-abcd',
      'action',
      'archive'
    );

    const uuidRow = editRes.rows.find((r) => String(r.id) === 'uuid-1234-abcd');
    assert.ok(uuidRow);
    assert.equal(uuidRow.action, 'archive');
    assert.equal(uuidRow.isDirty, true);
    assert.equal(editRes.selectedRowData?.action, 'archive');
    assert.equal(editRes.pendingEditsCount, 1);

    // Revert UUID row
    const revertRes = applyCellRevert(
      editRes.rows,
      originalRows,
      editRes.selectedRowData,
      'uuid-1234-abcd',
      'action'
    );

    const revertedUuidRow = revertRes.rows.find((r) => String(r.id) === 'uuid-1234-abcd');
    assert.ok(revertedUuidRow);
    assert.equal(revertedUuidRow.action, 'delete'); // original value
    assert.equal(revertedUuidRow.isDirty, false);
    assert.equal(revertRes.selectedRowData?.action, 'delete');
    assert.equal(revertRes.pendingEditsCount, 0);
  });

  it('reverts entire row with applyRowRevert when multiple fields were modified', () => {
    const { rows, originalRows, selectedRowData } = getCleanData();

    // Modify multiple fields on row 1
    const edit1 = applyCellUpdate(rows, originalRows, selectedRowData, 1, 'action', 'custom_action');
    const edit2 = applyCellUpdate(
      edit1.rows,
      originalRows,
      edit1.selectedRowData,
      1,
      'status',
      'inactive'
    );
    assert.equal(edit2.pendingEditsCount, 2);

    // Discard entire row
    const revertRes = applyRowRevert(edit2.rows, originalRows, edit2.selectedRowData, 1);

    const row1 = revertRes.rows.find((r) => r.id === 1);
    assert.ok(row1);
    assert.equal(row1.action, 'view');
    assert.equal(row1.status, 'active');
    assert.equal(row1.isDirty, false);
    assert.equal(row1.rowState, 'clean');
    assert.equal(revertRes.pendingEditsCount, 0);
    assert.equal(revertRes.isTransactionOpen, false);
    assert.equal(revertRes.selectedRowData?.action, 'view');
    assert.equal(revertRes.selectedRowData?.status, 'active');
  });

  it('rollbacks entire transaction and discards all pending uncommitted changes across all rows and selectedRowData', () => {
    const { rows, originalRows, selectedRowData } = getCleanData();

    // Edit row 1
    const edit1 = applyCellUpdate(rows, originalRows, selectedRowData, 1, 'action', 'fo');
    // Edit row 2
    const edit2 = applyCellUpdate(edit1.rows, originalRows, edit1.selectedRowData, 2, 'name', 'Updated Beta');

    assert.equal(edit2.pendingEditsCount, 2);
    assert.equal(edit2.isTransactionOpen, true);
    assert.equal(edit2.selectedRowData?.action, 'fo');

    // User clicks Discard (Titlebar or shortcut ⌘Z) -> applyTransactionRollback
    const rollbackRes = applyTransactionRollback(originalRows, edit2.selectedRowData);

    assert.equal(rollbackRes.pendingEditsCount, 0);
    assert.equal(rollbackRes.isTransactionOpen, false);

    const r1 = rollbackRes.rows.find((r) => r.id === 1);
    const r2 = rollbackRes.rows.find((r) => r.id === 2);
    const r3 = rollbackRes.rows.find((r) => String(r.id) === 'uuid-1234-abcd');

    assert.equal(r1?.action, 'view');
    assert.equal(r1?.isDirty, false);
    assert.equal(r2?.name, 'Beta Record');
    assert.equal(r2?.isDirty, false);
    assert.equal(r3?.action, 'delete');
    assert.equal(r3?.isDirty, false);

    // Crucial: Inspector selectedRowData is restored to clean alpha record without "fo"
    assert.equal(rollbackRes.selectedRowData?.action, 'view');
    assert.equal(rollbackRes.selectedRowData?.isDirty, false);
  });

  it('accurately counts dirty edits across inserted, deleted, and modified cells', () => {
    const testRows: GridRow[] = [
      { id: 1, action: 'a', rowState: 'modified', dirtyFields: { action: true } },
      { id: 2, action: 'b', rowState: 'inserted' },
      { id: 3, action: 'c', rowState: 'deleted' },
      { id: 4, action: 'd', rowState: 'clean' },
    ];
    assert.equal(countDirtyEdits(testRows), 3);
  });
});
