import type { DatabaseEngine } from '../../types/index.ts';

/**
 * Normalizes engine strings (e.g., 'PostgreSQL' -> 'postgres', 'MariaDB' -> 'mysql')
 * so backend and frontend comparisons are always consistent.
 */
export function normalizeDatabaseEngine(rawEngine?: string): DatabaseEngine {
  const lower = (rawEngine || 'postgres').trim().toLowerCase();
  if (lower.startsWith('postgres') || lower === 'pg' || lower === 'cockroach' || lower === 'cockroachdb') {
    return 'postgres';
  }
  if (lower.startsWith('mysql') || lower.startsWith('maria')) {
    return 'mysql';
  }
  if (lower.startsWith('redis') || lower.startsWith('valkey')) {
    return 'redis';
  }
  if (lower.startsWith('snowflake')) {
    return 'snowflake';
  }
  if (lower.startsWith('sqlite')) {
    return 'sqlite';
  }
  return 'postgres';
}

/**
 * Safely quotes a SQL identifier (table, schema, or column name) for the target engine.
 * Escapes embedded quote characters and strips null bytes to prevent SQL injection.
 */
export function quoteIdentifier(identifier: string, engine?: string): string {
  const cleaned = String(identifier || '').replace(/\0/g, '').trim();
  if (!cleaned) {
    throw new Error('SQL identifier cannot be empty');
  }
  const norm = normalizeDatabaseEngine(engine);
  const quotePart = (part: string) =>
    norm === 'mysql' ? `\`${part.replace(/`/g, '``')}\`` : `"${part.replace(/"/g, '""')}"`;

  if (cleaned.includes('.') && !cleaned.includes('"') && !cleaned.includes('`')) {
    return cleaned
      .split('.')
      .filter(Boolean)
      .map(quotePart)
      .join('.');
  }
  return quotePart(cleaned);
}

/**
 * Escapes a single-quoted SQL string literal (e.g. for catalog metadata lookups).
 */
export function escapeSqlStringLiteral(value: string): string {
  return String(value ?? '').replace(/\0/g, '').replace(/'/g, "''");
}

/**
 * Validates user-supplied filter clauses (`WHERE` or `ORDER BY`) to block stacked
 * multi-statement injection (`; DROP TABLE ...`) while allowing valid expressions.
 * Returns `''` if unsafe stacked statements or SQL comments are detected outside string literals.
 */
export function sanitizeFilterClause(clause: string): string {
  const trimmed = String(clause || '').trim();
  if (!trimmed) return '';

  // Strip trailing semicolons
  const withoutTrailingSemi = trimmed.replace(/;+\s*$/, '').trim();

  // Reject unquoted semicolons (stacked queries) or SQL comment tricks
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < withoutTrailingSemi.length; i++) {
    const ch = withoutTrailingSemi[i];
    if (ch === "'" && !inDoubleQuote) {
      if (withoutTrailingSemi[i + 1] === "'") {
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote) {
      if (ch === ';') {
        return '';
      }
      if (ch === '-' && withoutTrailingSemi[i + 1] === '-') {
        return '';
      }
      if (ch === '/' && withoutTrailingSemi[i + 1] === '*') {
        return '';
      }
    }
  }

  return withoutTrailingSemi;
}

/**
 * Masks credentials in connection URLs before logging or displaying in UI diagnostics.
 */
export function maskConnectionUrl(url: string): string {
  if (!url) return '';
  return url.replace(
    /^([a-zA-Z0-9+.-]+:\/\/[^:/?#\s]+:)([^@/\s]+)(@)/,
    '$1••••••••$3'
  );
}
