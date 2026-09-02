/**
 * Детектор реальної якості зв'язку для проєкту «Залізна Зміна».
 * Оптимізований для безперервної фонової роботи (в кишені, при заблокованому екрані, у тунелях та потягах УЗ).
 */

export type NetQuality = 'ONLINE_FAST' | 'ONLINE_SLOW' | 'OFFLINE';

export interface NetPulseState {
  quality: NetQuality;
  latency: number | null;
  checkedAt: number;
  isCaptivePortal: boolean;
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  saveData?: boolean;
}

type Listener = (state: NetPulseState) => void;

const PULSE_TIMEOUT_MS = 2500;
const SLOW_THRESHOLD_MS = 900;
const INTERVAL_FAST_MS = 30000;
const INTERVAL_SLOW_MS = 12000;
const BASE_OFFLINE_INTERVAL_MS = 5000;
const MAX_OFFLINE_INTERVAL_MS = 25000;

const INTERVAL_BG_ONLINE_MS = 45000;
const INTERVAL_BG_OFFLINE_MS = 20000;

export class NetworkPulse {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private worker: Worker | null = null;
  private inFlightCtrl: AbortController | null = null;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private isDocumentVisible = true;

  state: NetPulseState = {
    quality: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ONLINE_FAST',
    latency: null,
    checkedAt: 0,
    isCaptivePortal: false,
  };

  constructor() {
    if (typeof window === 'undefined') return;

    this.isDocumentVisible = document.visibilityState === 'visible';
    this.readNetworkApiInfo();
    this.initBackgroundWorker();

    window.addEventListener('online', () => {
      this.consecutiveFailures = 0;
      void this.checkRealConnection(true);
    });

    window.addEventListener('offline', () => {
      this.consecutiveFailures = 2;
      this.consecutiveSuccesses = 0;
      this.emit({
        ...this.state,
        quality: 'OFFLINE',
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
      this.scheduleNextProbe();
    });

    document.addEventListener('visibilitychange', () => {
      this.isDocumentVisible = document.visibilityState === 'visible';
      if (this.isDocumentVisible) {
        void this.checkRealConnection(true);
      } else {
        this.scheduleNextProbe();
      }
    });

    const conn = this.getConnectionObj();
    if (conn) {
      conn.addEventListener('change', () => {
        this.readNetworkApiInfo();
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
          if (this.state.quality === 'ONLINE_FAST') {
            this.emit({
              ...this.state,
              quality: 'ONLINE_SLOW',
              checkedAt: Date.now(),
            });
          }
        }
      });
    }

    this.schedule(150);
  }

  private initBackgroundWorker() {
    try {
      const workerBlob = new Blob(
        [
          `
          var bgTimer = null;
          self.onmessage = function(e) {
            if (e.data.type === 'schedule') {
              if (bgTimer) clearTimeout(bgTimer);
              bgTimer = setTimeout(function() {
                self.postMessage({ type: 'tick' });
              }, e.data.delay);
            } else if (e.data.type === 'clear') {
              if (bgTimer) clearTimeout(bgTimer);
              bgTimer = null;
            }
          };
          `,
        ],
        { type: 'application/javascript' }
      );

      const blobUrl = URL.createObjectURL(workerBlob);
      this.worker = new Worker(blobUrl);

      this.worker.onmessage = (e) => {
        if (e.data?.type === 'tick') {
          void this.checkRealConnection();
        }
      };
    } catch {
      this.worker = null;
    }
  }

  private getConnectionObj(): any {
    if (typeof navigator === 'undefined') return null;
    return (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  }

  private readNetworkApiInfo() {
    const conn = this.getConnectionObj();
    if (conn) {
      this.state.effectiveType = conn.effectiveType;
      this.state.saveData = !!conn.saveData;
    }
  }

  async checkRealConnection(force = false): Promise<NetPulseState> {
    if (this.inFlightCtrl && !force) return this.state;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.consecutiveFailures = Math.max(2, this.consecutiveFailures + 1);
      this.consecutiveSuccesses = 0;
      return this.emit({
        ...this.state,
        quality: 'OFFLINE',
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
    }

    if (this.inFlightCtrl) {
      this.inFlightCtrl.abort();
    }

    this.inFlightCtrl = new AbortController();
    const ctrl = this.inFlightCtrl;
    const timeoutId = setTimeout(() => ctrl.abort(), PULSE_TIMEOUT_MS);
    const started = performance.now();

    try {
      const res = await fetch(`/favicon.ico?_p=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        redirect: 'manual',
        headers: { Accept: '*/*' },
        signal: ctrl.signal,
      });

      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - started);

      const isRedirect = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
      const contentType = res.headers.get('content-type') || '';
      const isHtmlResponse = contentType.toLowerCase().includes('text/html');

      if (isRedirect || isHtmlResponse) {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        return this.emit({
          ...this.state,
          quality: 'OFFLINE',
          latency: null,
          checkedAt: Date.now(),
          isCaptivePortal: true,
        });
      }

      if (res.ok || res.status === 304 || res.status === 204) {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        const quality: NetQuality =
          latency > SLOW_THRESHOLD_MS || this.state.effectiveType === '2g' || this.state.effectiveType === 'slow-2g'
            ? 'ONLINE_SLOW'
            : 'ONLINE_FAST';

        return this.emit({
          ...this.state,
          quality,
          latency,
          checkedAt: Date.now(),
          isCaptivePortal: false,
        });
      }

      throw new Error(`HTTP_${res.status}`);
    } catch {
      clearTimeout(timeoutId);
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      const nextQuality: NetQuality = this.consecutiveFailures >= 2 ? 'OFFLINE' : 'ONLINE_SLOW';

      return this.emit({
        ...this.state,
        quality: nextQuality,
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
    } finally {
      this.inFlightCtrl = null;
      this.scheduleNextProbe();
    }
  }

  private scheduleNextProbe() {
    let delay: number;

    if (!this.isDocumentVisible) {
      if (this.state.quality === 'OFFLINE') {
        delay = INTERVAL_BG_OFFLINE_MS;
      } else {
        delay = INTERVAL_BG_ONLINE_MS;
      }
    } else {
      if (this.state.quality === 'ONLINE_SLOW') {
        delay = INTERVAL_SLOW_MS;
      } else if (this.state.quality === 'OFFLINE') {
        const backoff = BASE_OFFLINE_INTERVAL_MS * Math.pow(1.4, Math.min(this.consecutiveFailures, 4));
        delay = Math.min(backoff, MAX_OFFLINE_INTERVAL_MS);
      } else {
        delay = INTERVAL_FAST_MS;
      }
    }

    if (this.state.saveData) {
      delay = Math.round(delay * 1.5);
    }

    const jitter = delay * 0.15 * (Math.random() * 2 - 1);
    this.schedule(Math.round(delay + jitter));
  }

  private schedule(delay: number) {
    this.clearTimer();

    if (this.worker) {
      this.worker.postMessage({ type: 'schedule', delay });
    } else {
      this.timer = setTimeout(() => {
        void this.checkRealConnection();
      }, delay);
    }
  }

  private clearTimer() {
    if (this.worker) {
      this.worker.postMessage({ type: 'clear' });
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(next: NetPulseState): NetPulseState {
    const qualityChanged = next.quality !== this.state.quality;
    const portalChanged = next.isCaptivePortal !== this.state.isCaptivePortal;
    const latencyChanged = next.latency !== this.state.latency;

    this.state = next;

    if (qualityChanged || portalChanged || (this.state.quality !== 'OFFLINE' && latencyChanged)) {
      this.listeners.forEach((l) => l(next));
    }
    return next;
  }

  isOnline(): boolean {
    return this.state.quality !== 'OFFLINE';
  }

  isSlow(): boolean {
    return this.state.quality === 'ONLINE_SLOW';
  }

  async waitForOnline(timeoutMs = 60000): Promise<boolean> {
    if (this.isOnline()) return true;

    return new Promise<boolean>((resolve) => {
      let cleanup: () => void;
      const timeoutTimer = setTimeout(() => {
        cleanup();
        resolve(this.isOnline());
      }, timeoutMs);

      cleanup = this.subscribe((state) => {
        if (state.quality !== 'OFFLINE') {
          clearTimeout(timeoutTimer);
          cleanup();
          resolve(true);
        }
      });
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.clearTimer();
    if (this.inFlightCtrl) {
      this.inFlightCtrl.abort();
      this.inFlightCtrl = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners.clear();
  }
}

export const networkPulse = new NetworkPulse();
export const networkEngine = networkPulse;
