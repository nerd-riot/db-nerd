import { useAppStore } from '../stores/useAppStore';
import { testRealConnection } from './dbService';

/**
 * Adaptive, Ultra-Lightweight Connection Heartbeat Monitor
 *
 * Performance-tuned to prevent spamming and memory consumption:
 * 1. Document visibility gating: completely stops pinging when tab/window is hidden or blurred.
 * 2. Activity-aware piggybacking: if real queries or user actions ran in the last 30s, skips ping.
 * 3. Exponential backoff on failed connections to avoid socket exhaustion.
 * 4. Strictly bounded $O(1)$ memory buffer (max 10 float samples).
 */
class HeartbeatService {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTimestamp: number = Date.now();
  private isPinging: boolean = false;
  private consecutiveFailures: number = 0;
  private isRunning: boolean = false;
  private latencyHistory: number[] = [];

  constructor() {
    this.setupListeners();
  }

  /**
   * Piggyback hook: call on query execution or tab switch.
   * If a real database operation just succeeded, connection is proven alive.
   */
  public recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
    this.consecutiveFailures = 0;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNext(15000); // Initial health check after 15s
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private setupListeners(): void {
    if (typeof window === 'undefined') return;

    // Immediately suspend all activity when window is minimized or tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
      } else {
        // Upon returning, if inactive for > 30s, verify instance once
        if (Date.now() - this.lastActivityTimestamp > 30000) {
          this.checkNow();
        } else {
          this.scheduleNext(30000);
        }
      }
    });

    window.addEventListener('focus', () => {
      if (Date.now() - this.lastActivityTimestamp > 30000) {
        this.checkNow();
      }
    });
  }

  private scheduleNext(delayMs: number): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
    if (!this.isRunning) return;

    this.timerId = setTimeout(() => {
      this.checkNow();
    }, delayMs);
  }

  public async checkNow(): Promise<boolean> {
    if (this.isPinging || !this.isRunning) return false;

    // Do NOT ping if window is hidden (zero background RAM / CPU burn)
    if (typeof document !== 'undefined' && document.hidden) {
      return false;
    }

    const store = useAppStore.getState();
    const activeConn = store.activeConnection;
    if (!activeConn || store.openSessionIds.length === 0 || !store.openSessionIds.includes(activeConn.id)) {
      this.scheduleNext(30000);
      return false;
    }

    // Piggyback check: If real query ran < 30s ago and status is connected, skip ping!
    const elapsedSinceActivity = Date.now() - this.lastActivityTimestamp;
    if (elapsedSinceActivity < 30000 && activeConn.connectionStatus === 'connected') {
      this.scheduleNext(30000 - elapsedSinceActivity);
      return true;
    }

    this.isPinging = true;
    const start = performance.now();

    try {
      const res = await testRealConnection(activeConn);
      const latency = res.latency_ms > 0 ? res.latency_ms : +(performance.now() - start).toFixed(1);

      if (res.success) {
        this.consecutiveFailures = 0;
        this.lastActivityTimestamp = Date.now();
        this.latencyHistory = [...this.latencyHistory.slice(-9), latency];

        store.updateHeartbeat(latency, true);
        this.scheduleNext(30000); // Healthy cadence: 30s
        return true;
      } else {
        this.consecutiveFailures++;
        store.updateHeartbeat(0, false, res.message);

        // Exponential backoff to avoid spamming failed instances (10s -> 20s -> 45s -> max 60s)
        const backoff = Math.min(10000 * Math.pow(1.5, this.consecutiveFailures), 60000);
        this.scheduleNext(backoff);
        return false;
      }
    } catch (err: any) {
      this.consecutiveFailures++;
      store.updateHeartbeat(0, false, String(err?.message || err));
      this.scheduleNext(30000);
      return false;
    } finally {
      this.isPinging = false;
    }
  }
}

export const heartbeatService = new HeartbeatService();
