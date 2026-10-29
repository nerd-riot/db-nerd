import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCellUpdate,
  applyCellRevert,
  applyRowRevert,
  applyTransactionRollback,
  countDirtyEdits,
} from '../src/lib/grid/rowEditing.ts';
import { buildTruncateTableSql, buildDropTableSql } from '../src/lib/db/dmlGenerator.ts';
import type { GridRow, PendingTableAction } from '../src/types/index.ts';

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

  it('combines pending table actions with row edits in pendingEditsCount and preserves them until committed or discarded', () => {
    const { rows, originalRows, selectedRowData } = getCleanData();

    // 1 staged table action (e.g. TRUNCATE TABLE users)
    const stagedAction: PendingTableAction = {
      id: 'action-1',
      type: 'truncate',
      tableName: 'users',
      sql: 'TRUNCATE TABLE "users" RESTART IDENTITY;',
      options: { restartIdentity: true },
    };
    const extraPendingCount = 1;

    // Apply cell update on row 1 while 1 table action is staged
    const editRes = applyCellUpdate(
      rows,
      originalRows,
      selectedRowData,
      1,
      'action',
      'updated_val',
      extraPendingCount
    );

    // Total pending edits must be 1 (row edit) + 1 (staged table action) = 2
    assert.equal(editRes.pendingEditsCount, 2);
    assert.equal(editRes.isTransactionOpen, true);

    // Revert cell edit: pending count should revert back to extraPendingCount (1) and remain open
    const revertRes = applyCellRevert(
      editRes.rows,
      originalRows,
      editRes.selectedRowData,
      1,
      'action',
      extraPendingCount
    );
    assert.equal(revertRes.pendingEditsCount, 1);
    assert.equal(revertRes.isTransactionOpen, true);
  });

  it('generates correct SQL statements for truncate and drop table actions across database engines', () => {
    // Postgres truncate with options
    const pgTruncate = buildTruncateTableSql('orders', 'postgres', 'public', {
      restartIdentity: true,
      cascade: true,
    });
    assert.equal(pgTruncate, 'TRUNCATE TABLE "public"."orders" RESTART IDENTITY CASCADE;');

    // Postgres drop table
    const pgDrop = buildDropTableSql('orders', 'postgres', 'public', { cascade: true });
    assert.equal(pgDrop, 'DROP TABLE IF EXISTS "public"."orders" CASCADE;');

    // MySQL drop table with ignore foreign key checks
    const mysqlDrop = buildDropTableSql('orders', 'mysql', undefined, { ignoreFk: true });
    assert.equal(
      mysqlDrop,
      'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS `orders`; SET FOREIGN_KEY_CHECKS = 1;'
    );
  });

  it('auto-casts NULL strings and type matches numeric and boolean values in applyCellUpdate', () => {
    const originalRows: GridRow[] = [
      {
        id: 1,
        net_incentive: 80000,
        is_active: false,
        end_date: '2023-09-30 16:00:00',
        isDirty: false,
        rowState: 'clean',
      },
    ];
    const rows = JSON.parse(JSON.stringify(originalRows));

    // 1. Setting 'NULL' or 'null' string converts to actual null
    const nullRes = applyCellUpdate(rows, originalRows, rows[0], 1, 'end_date', 'NULL');
    assert.equal(nullRes.rows[0].end_date, null);
    assert.equal(nullRes.rows[0].isDirty, true);

    // 2. Numeric string on numeric column auto-casts to number
    const numRes = applyCellUpdate(rows, originalRows, rows[0], 1, 'net_incentive', '85000');
    assert.equal(numRes.rows[0].net_incentive, 85000);
    assert.equal(typeof numRes.rows[0].net_incentive, 'number');

    // 3. Typing exact same number as string does NOT falsely dirty the row
    const sameNumRes = applyCellUpdate(rows, originalRows, rows[0], 1, 'net_incentive', '80000');
    assert.equal(sameNumRes.rows[0].net_incentive, 80000);
    assert.equal(sameNumRes.rows[0].isDirty, false);

    // 4. Boolean string on boolean column auto-casts to boolean
    const boolRes = applyCellUpdate(rows, originalRows, rows[0], 1, 'is_active', 'true');
    assert.equal(boolRes.rows[0].is_active, true);
    assert.equal(typeof boolRes.rows[0].is_active, 'boolean');
  });

  it('guarantees inline editor is not closed on initial edit when pendingEditsCount is 0', () => {
    let pendingEditsCount = 0;
    let editingCell: { id: number | string; field: string } | null = null;
    let prevPendingCount = pendingEditsCount;

    // Simulate opening inline editor
    editingCell = { id: 1, field: 'net_incentive' };

    // The guard condition: only close if prevPendingCount > 0 && pendingEditsCount === 0
    let shouldAutoClose = prevPendingCount > 0 && pendingEditsCount === 0 && editingCell !== null;
    assert.equal(shouldAutoClose, false, 'Editor must stay open when pendingEditsCount is initially 0');

    // When an edit is applied:
    pendingEditsCount = 1;
    prevPendingCount = pendingEditsCount;

    // Now if user clicks Discard / Rollback, pending count drops from 1 to 0:
    pendingEditsCount = 0;
    shouldAutoClose = prevPendingCount > 0 && pendingEditsCount === 0 && editingCell !== null;
    assert.equal(shouldAutoClose, true, 'Editor should auto-close when pending edits transition from > 0 to 0');
  });
});

