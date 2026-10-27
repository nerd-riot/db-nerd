import type { EnvironmentTag } from '../types/index.ts';

export interface SqlSafetyIssue {
  type: 'UNRESTRICTED_UPDATE' | 'UNRESTRICTED_DELETE' | 'DROP' | 'TRUNCATE' | 'COMMIT' | 'ALTER' | 'WRITE';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  message: string;
  snippet: string;
}

export interface SqlSafetyReport {
  isReadOnly: boolean;
  issues: SqlSafetyIssue[];
  hasCriticalIssue: boolean;
  statementsCount: number;
}

/**
 * Splits SQL text into individual statements, ignoring semicolons within strings or comments.
 */
export function splitSqlStatementsForSafety(sqlText: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const char = sqlText[i];
    const nextChar = sqlText[i + 1] || '';

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += '/';
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '-' && nextChar === '-') {
        inLineComment = true;
        current += '--';
        i++;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += '/*';
        i++;
        continue;
      }
    }

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && nextChar === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += char;
  }

  const remainder = current.trim();
  if (remainder) statements.push(remainder);

  return statements;
}

/**
 * Strips comments from SQL statement to analyze raw keywords.
 */
function stripComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

/**
 * Returns true if all statements in the query are read-only operations
 * (SELECT, EXPLAIN, SHOW, DESCRIBE, PRAGMA).
 */
export function isReadOnlySql(sql: string): boolean {
  if (!sql || !sql.trim()) return true;

  const statements = splitSqlStatementsForSafety(sql);
  if (statements.length === 0) return true;

  const readOnlyKeywords = ['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'PRAGMA'];

  for (const stmt of statements) {
    const cleaned = stripComments(stmt);
    if (!cleaned) continue;

    const firstWordMatch = cleaned.match(/^([a-zA-Z]+)/);
    if (!firstWordMatch) return false;

    const firstWord = firstWordMatch[1].toUpperCase();

    if (firstWord === 'WITH') {
      // Common Table Expression: could be WITH ... SELECT or WITH ... UPDATE/DELETE/INSERT
      if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(cleaned)) {
        return false;
      }
      continue;
    }

    if (!readOnlyKeywords.includes(firstWord)) {
      return false;
    }
  }

  return true;
}

/**
 * Performs deep semantic inspection on SQL statements to find hazardous queries
 * like unconstrained UPDATE/DELETE without WHERE, DROP, TRUNCATE, etc.
 */
export function analyzeSqlSafety(sql: string, _env?: EnvironmentTag): SqlSafetyReport {
  const statements = splitSqlStatementsForSafety(sql);
  const issues: SqlSafetyIssue[] = [];

  for (const stmt of statements) {
    const cleaned = stripComments(stmt);
    if (!cleaned) continue;

    const upper = cleaned.toUpperCase();

    // 1. Critical: UPDATE without WHERE
    if (/\bUPDATE\b/.test(upper)) {
      if (!/\bWHERE\b/.test(upper)) {
        issues.push({
          type: 'UNRESTRICTED_UPDATE',
          severity: 'critical',
          title: 'Unrestricted UPDATE without WHERE',
          message: 'This statement modifies EVERY single row in the table without a WHERE filter condition!',
          snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
        });
      } else {
        issues.push({
          type: 'WRITE',
          severity: 'medium',
          title: 'UPDATE Statement',
          message: 'Modifies existing row data in database table.',
          snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
        });
      }
    }

    // 2. Critical: DELETE without WHERE
    if (/\bDELETE\b/.test(upper)) {
      if (!/\bWHERE\b/.test(upper)) {
        issues.push({
          type: 'UNRESTRICTED_DELETE',
          severity: 'critical',
          title: 'Unrestricted DELETE without WHERE',
          message: 'This statement will permanently delete ALL rows in the table without a WHERE filter condition!',
          snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
        });
      } else {
        issues.push({
          type: 'WRITE',
          severity: 'high',
          title: 'DELETE Statement',
          message: 'Permanently deletes records matching filter condition.',
          snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
        });
      }
    }

    // 3. Critical: DROP
    if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX)\b/.test(upper)) {
      issues.push({
        type: 'DROP',
        severity: 'critical',
        title: 'DROP Statement Detected',
        message: 'Irreversibly destroys database objects, tables, or schema schemas!',
        snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
      });
    }

    // 4. Critical: TRUNCATE
    if (/\bTRUNCATE\b/.test(upper)) {
      issues.push({
        type: 'TRUNCATE',
        severity: 'critical',
        title: 'TRUNCATE Statement Detected',
        message: 'Immediately wipes all rows in target table, resetting identity sequences.',
        snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
      });
    }

    // 5. High: COMMIT
    if (/\bCOMMIT\b/.test(upper)) {
      issues.push({
        type: 'COMMIT',
        severity: 'high',
        title: 'Transaction COMMIT',
        message: 'Persists all pending transactional changes to the live database.',
        snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
      });
    }

    // 6. High: ALTER TABLE
    if (/\bALTER\s+TABLE\b/.test(upper)) {
      issues.push({
        type: 'ALTER',
        severity: 'high',
        title: 'ALTER TABLE Statement',
        message: 'Modifies table schema definition (may take exclusive table locks).',
        snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
      });
    }

    // 7. Medium: INSERT / REPLACE
    if (/\b(INSERT\s+INTO|REPLACE\s+INTO)\b/.test(upper)) {
      issues.push({
        type: 'WRITE',
        severity: 'medium',
        title: 'INSERT / Write Operation',
        message: 'Appends new records to database table.',
        snippet: stmt.slice(0, 150) + (stmt.length > 150 ? '...' : ''),
      });
    }
  }

  const isReadOnly = isReadOnlySql(sql);
  const hasCriticalIssue = issues.some((i) => i.severity === 'critical');

  return {
    isReadOnly,
    issues,
    hasCriticalIssue,
    statementsCount: statements.length,
  };
}
