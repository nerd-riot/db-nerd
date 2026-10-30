import type { ColumnDefinition } from '../../types/index.ts';
import { normalizeDatabaseEngine, quoteIdentifier } from '../security/sqlSanitizer.ts';

export interface StagedColumnDefinition extends ColumnDefinition {
  _originalName?: string;
  _isNew?: boolean;
  _isDeleted?: boolean;
  _state?: 'clean' | 'inserted' | 'modified' | 'deleted';
  _dirtyFields?: Partial<Record<keyof ColumnDefinition, boolean>>;
}

export interface BuildAlterTableSqlParams {
  tableName: string;
  originalColumns: ColumnDefinition[];
  currentColumns: StagedColumnDefinition[];
  engine?: string;
  schema?: string;
}

/**
 * Returns formatted default SQL expression or empty string if not applicable.
 */
function formatDefaultValue(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const trimmed = String(val).trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return '';
  return `DEFAULT ${trimmed}`;
}

/**
 * Analyzes original vs staged columns and produces dialect-aware ALTER TABLE statements.
 */
export function generateAlterTableStatements({
  tableName,
  originalColumns,
  currentColumns,
  engine = 'postgres',
  schema,
}: BuildAlterTableSqlParams): string[] {
  const norm = normalizeDatabaseEngine(engine);
  const qualifiedTable =
    (norm === 'postgres' || norm === 'snowflake') && schema && !tableName.includes('.')
      ? `${schema}.${tableName}`
      : tableName;
  const quotedTable = quoteIdentifier(qualifiedTable, engine);

  const statements: string[] = [];
  const originalMap = new Map<string, ColumnDefinition>();
  for (const col of originalColumns) {
    originalMap.set(col.name, col);
  }

  // 1. Process dropped columns
  for (const col of currentColumns) {
    if (col._isDeleted || col._state === 'deleted') {
      const origName = col._originalName || col.name;
      statements.push(`ALTER TABLE ${quotedTable} DROP COLUMN ${quoteIdentifier(origName, engine)};`);
    }
  }

  // 2. Process existing columns (renames, modifications)
  for (const col of currentColumns) {
    if (col._isDeleted || col._state === 'deleted' || col._isNew || col._state === 'inserted') {
      continue;
    }

    const origName = col._originalName || col.name;
    const orig = originalMap.get(origName);
    if (!orig) continue;

    // A. Rename column
    if (col.name !== origName) {
      statements.push(
        `ALTER TABLE ${quotedTable} RENAME COLUMN ${quoteIdentifier(origName, engine)} TO ${quoteIdentifier(col.name, engine)};`
      );
    }

    const currentIdent = quoteIdentifier(col.name, engine);

    // B. Type modification
    if (col.type !== orig.type) {
      if (norm === 'postgres') {
        statements.push(
          `ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} TYPE ${col.type} USING ${currentIdent}::${col.type};`
        );
      } else if (norm === 'mysql') {
        const notNull = col.isNullable ? '' : ' NOT NULL';
        const def = formatDefaultValue(col.defaultValue) ? ` ${formatDefaultValue(col.defaultValue)}` : '';
        statements.push(
          `ALTER TABLE ${quotedTable} MODIFY COLUMN ${currentIdent} ${col.type}${notNull}${def};`
        );
      } else {
        // SQLite does not support ALTER COLUMN TYPE natively
        statements.push(`-- ALTER COLUMN ${currentIdent} TYPE ${col.type} not supported in SQLite`);
      }
    }

    // C. Nullability modification
    if (col.isNullable !== orig.isNullable && norm === 'postgres') {
      if (col.isNullable) {
        statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} DROP NOT NULL;`);
      } else {
        statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} SET NOT NULL;`);
      }
    }

    // D. Default value modification
    if (col.defaultValue !== orig.defaultValue) {
      const origDef = formatDefaultValue(orig.defaultValue);
      const newDef = formatDefaultValue(col.defaultValue);

      if (origDef !== newDef) {
        if (norm === 'postgres') {
          if (!newDef) {
            statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} DROP DEFAULT;`);
          } else {
            statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} SET ${newDef};`);
          }
        } else if (norm === 'mysql') {
          if (!newDef) {
            statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} DROP DEFAULT;`);
          } else {
            statements.push(`ALTER TABLE ${quotedTable} ALTER COLUMN ${currentIdent} SET ${newDef};`);
          }
        }
      }
    }

    // E. Comment modification
    if (col.comment !== orig.comment && col.comment !== undefined) {
      const cleanComment = (col.comment || '').replace(/'/g, "''");
      if (norm === 'postgres') {
        statements.push(`COMMENT ON COLUMN ${quotedTable}.${currentIdent} IS '${cleanComment}';`);
      } else if (norm === 'mysql') {
        const notNull = col.isNullable ? '' : ' NOT NULL';
        const def = formatDefaultValue(col.defaultValue) ? ` ${formatDefaultValue(col.defaultValue)}` : '';
        statements.push(
          `ALTER TABLE ${quotedTable} MODIFY COLUMN ${currentIdent} ${col.type}${notNull}${def} COMMENT '${cleanComment}';`
        );
      }
    }
  }

  // 3. Process newly added columns
  for (const col of currentColumns) {
    if (col._isDeleted || col._state === 'deleted') continue;
    const origName = col._originalName || col.name;
    const isNew = col._isNew || col._state === 'inserted' || (!originalMap.has(col.name) && !originalMap.has(origName));
    if (isNew) {
      const colIdent = quoteIdentifier(col.name, engine);
      const def = formatDefaultValue(col.defaultValue);
      const notNull = col.isNullable ? '' : ' NOT NULL';
      const defClause = def ? ` ${def}` : '';

      if (norm === 'postgres') {
        statements.push(
          `ALTER TABLE ${quotedTable} ADD COLUMN ${colIdent} ${col.type}${defClause}${notNull};`
        );
        if (col.comment) {
          const cleanComment = col.comment.replace(/'/g, "''");
          statements.push(`COMMENT ON COLUMN ${quotedTable}.${colIdent} IS '${cleanComment}';`);
        }
      } else if (norm === 'mysql') {
        const commentClause = col.comment ? ` COMMENT '${col.comment.replace(/'/g, "''")}'` : '';
        statements.push(
          `ALTER TABLE ${quotedTable} ADD COLUMN ${colIdent} ${col.type}${notNull}${defClause}${commentClause};`
        );
      } else {
        // SQLite
        statements.push(
          `ALTER TABLE ${quotedTable} ADD COLUMN ${colIdent} ${col.type}${notNull}${defClause};`
        );
      }
    }
  }

  return statements;
}

/**
 * Builds executable DDL SQL script, wrapped in transaction if supported.
 */
export function buildAlterTableSql(params: BuildAlterTableSqlParams): string {
  const statements = generateAlterTableStatements(params);
  if (statements.length === 0) {
    return '-- No pending structure changes';
  }

  const norm = normalizeDatabaseEngine(params.engine);
  if (norm === 'postgres' || norm === 'sqlite') {
    return `BEGIN TRANSACTION;\n\n${statements.join('\n')}\n\nCOMMIT;`;
  }

  return statements.join('\n');
}
