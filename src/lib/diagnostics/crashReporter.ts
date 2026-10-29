/**
 * DB Nerd Crash Reporter & Diagnostic Buffer Engine
 *
 * Captures, deduplicates, and persists runtime errors, unhandled rejections,
 * and component crashes in a bounded ring buffer in localStorage (`dbnerd_crash_reports`).
 */

export interface CrashReportItem {
  id: string;
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'boundary' | 'panic';
  message: string;
  stack?: string;
  url?: string;
  meta?: Record<string, any>;
}

export const CRASH_STORAGE_KEY = 'dbnerd_crash_reports';
export const MAX_CRASH_REPORTS = 20;

export function getPersistedCrashReports(): CrashReportItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(CRASH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[CrashReporter] Failed to read crash reports:', err);
    return [];
  }
}

export function recordCrashReport(
  type: 'error' | 'unhandledrejection' | 'boundary' | 'panic',
  err: any,
  meta?: Record<string, any>
): CrashReportItem {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : err?.message || JSON.stringify(err) || 'Unknown error';

  const stack = err instanceof Error ? err.stack : undefined;
  const url = typeof window !== 'undefined' ? window.location?.href : undefined;

  const item: CrashReportItem = {
    id: `crash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    message: String(message).slice(0, 2048),
    stack: stack ? String(stack).slice(0, 4096) : undefined,
    url,
    meta,
  };

  try {
    const existing = getPersistedCrashReports();
    // Deduplicate identical error within 5 seconds
    const isDup = existing.some(
      (r) =>
        r.message === item.message &&
        Math.abs(new Date(r.timestamp).getTime() - new Date(item.timestamp).getTime()) < 5000
    );

    if (!isDup) {
      const updated = [item, ...existing].slice(0, MAX_CRASH_REPORTS);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(CRASH_STORAGE_KEY, JSON.stringify(updated));
      }
    }
  } catch (saveErr) {
    console.warn('[CrashReporter] Failed to persist crash report:', saveErr);
  }

  return item;
}

export function clearPersistedCrashReports(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(CRASH_STORAGE_KEY);
    } catch {}
  }
}

export function exportCrashDiagnostics(): string {
  const reports = getPersistedCrashReports();
  const summary = {
    app: 'DB Nerd',
    generatedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    reportCount: reports.length,
    reports,
  };
  return JSON.stringify(summary, null, 2);
}
