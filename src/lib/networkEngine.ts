/**
 * Детектор реальної якості зв'язку для проєкту «Залізна Зміна».
 *
 * `navigator.onLine` бреше в потязі та в гірських тунелях: Wi-Fi/LTE
 * «підключено», але жоден пакет не проходить. Тому робимо власний
 * 1-байтний пульс (HEAD-запит) з жорстким таймаутом.
 */

export type NetQuality = 'ONLINE_FAST' | 'ONLINE_SLOW' | 'OFFLINE';

export interface NetPulseState {
  quality: NetQuality;
  latency: number | null;
  checkedAt: number;
}

type Listener = (s: NetPulseState) => void;

/** Жорсткий таймаут пульсу — далі чекати немає сенсу навіть на 2G. */
const PULSE_TIMEOUT_MS = 2500;
/** Понад цей поріг мережа вважається повільною (EDGE / потяг). */
const SLOW_THRESHOLD_MS = 1200;
const INTERVAL_FAST = 20000;
const INTERVAL_SLOW = 8000;

export class NetworkPulse {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;

  state: NetPulseState = {
    quality: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ONLINE_FAST',
    latency: null,
    checkedAt: 0,
  };

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => { void this.checkRealConnection(); });
    window.addEventListener('offline', () => this.emit({ quality: 'OFFLINE', latency: null, checkedAt: Date.now() }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.checkRealConnection();
    });
    this.schedule(0);
  }

  /** Один короткий HEAD-запит із жорстким таймаутом. */
  async checkRealConnection(): Promise<NetPulseState> {
    if (this.inFlight) return this.state;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.emit({ quality: 'OFFLINE', latency: null, checkedAt: Date.now() });
    }
    this.inFlight = true;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), PULSE_TIMEOUT_MS);
    const started = performance.now();
    try {
      await fetch(`/favicon.ico?p=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const latency = Math.round(performance.now() - started);
      return this.emit({
        quality: latency > SLOW_THRESHOLD_MS ? 'ONLINE_SLOW' : 'ONLINE_FAST',
        latency,
        checkedAt: Date.now(),
      });
    } catch {
      return this.emit({ quality: 'OFFLINE', latency: null, checkedAt: Date.now() });
    } finally {
      clearTimeout(to);
      this.inFlight = false;
      this.schedule(this.state.quality === 'ONLINE_FAST' ? INTERVAL_FAST : INTERVAL_SLOW);
    }
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.checkRealConnection(); }, delay);
  }

  private emit(next: NetPulseState): NetPulseState {
    const changed = next.quality !== this.state.quality;
    this.state = next;
    if (changed) this.listeners.forEach((l) => l(next));
    return next;
  }

  isOnline(): boolean {
    return this.state.quality !== 'OFFLINE';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
}

export const networkPulse = new NetworkPulse();
