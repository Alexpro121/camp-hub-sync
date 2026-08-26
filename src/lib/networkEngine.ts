/**
 * Детектор реальної якості зв'язку для проєкту «Залізна Зміна».
 * Оптимізований для автономної роботи в потягах УЗ, карпатських перевалах і тунелях.
 */

export type NetQuality = 'ONLINE_FAST' | 'ONLINE_SLOW' | 'OFFLINE';

export interface NetPulseState {
  quality: NetQuality;
  latency: number | null;
  checkedAt: number;
  isCaptivePortal?: boolean;
}

type Listener = (state: NetPulseState) => void;

// Конфігурація для умов екстремального 2G/потяга
const PULSE_TIMEOUT_MS = 2800;          // Жорсткий таймаут (довше чекати на 2G немає сенсу)
const SLOW_THRESHOLD_MS = 1100;         // Поріг повільного інтернету (EDGE / гори)
const INTERVAL_FAST_MS = 25000;         // Інтервал при ідеальному 4G
const INTERVAL_SLOW_MS = 10000;         // Інтервал при нестабільному 2G
const BASE_OFFLINE_INTERVAL_MS = 6000;  // Базовий інтервал пошуку мережі в офлайні
const MAX_OFFLINE_INTERVAL_MS = 30000;  // Максимальний інтервал (експоненційний відкат)

export class NetworkPulse {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private consecutiveFailures = 0;
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

    // 1. Нативні події браузера
    window.addEventListener('online', () => {
      this.consecutiveFailures = 0;
      void this.checkRealConnection(true);
    });

    window.addEventListener('offline', () => {
      this.consecutiveFailures = 1;
      this.emit({
        quality: 'OFFLINE',
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
    });

    // 2. Економія батареї: зупинка у фоні, миттєвий пульс при розблокуванні
    document.addEventListener('visibilitychange', () => {
      this.isDocumentVisible = document.visibilityState === 'visible';
      if (this.isDocumentVisible) {
        // Телефон розблокували — перевіряємо негайно
        void this.checkRealConnection(true);
      } else {
        this.clearTimer();
      }
    });

    // 3. Network Information API (швидке визначення 2G/EDGE на смартфонах)
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      conn.addEventListener('change', () => {
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

    // Перший запуск
    this.schedule(100);
  }

  /**
   * Активний Micro-Ping із захистом від кешу, редиректів та таймаутів.
   * @param force - ігнорувати поточні затримки і виконати запит негайно
   */
  async checkRealConnection(force = false): Promise<NetPulseState> {
    if (this.inFlight) return this.state;
    if (!this.isDocumentVisible && !force) return this.state;

    // Швидка апаратна перевірка
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.consecutiveFailures++;
      return this.emit({
        quality: 'OFFLINE',
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
    }

    this.inFlight = true;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), PULSE_TIMEOUT_MS);
    const started = performance.now();

    try {
      // 1-байтний запит до favicon з унікальним таймстемпом проти кешування
      const res = await fetch(`/favicon.ico?_pulse=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
        redirect: 'manual', // Запобігає тихому редиректу на сторінки авторизації Wi-Fi
        signal: ctrl.signal,
      });

      clearTimeout(to);
      const latency = Math.round(performance.now() - started);

      // Якщо сервер відповів редиректом (301/302/0) — це Captive Portal (інтернету немає)
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        this.consecutiveFailures++;
        return this.emit({
          quality: 'OFFLINE',
          latency: null,
          checkedAt: Date.now(),
          isCaptivePortal: true,
        });
      }

      if (res.ok || res.status === 304 || res.status === 204) {
        this.consecutiveFailures = 0;
        const quality: NetQuality = latency > SLOW_THRESHOLD_MS ? 'ONLINE_SLOW' : 'ONLINE_FAST';
        return this.emit({
          quality,
          latency,
          checkedAt: Date.now(),
          isCaptivePortal: false,
        });
      }

      throw new Error(`HTTP_${res.status}`);
    } catch {
      clearTimeout(to);
      this.consecutiveFailures++;
      return this.emit({
        quality: 'OFFLINE',
        latency: null,
        checkedAt: Date.now(),
        isCaptivePortal: false,
      });
    } finally {
      this.inFlight = false;
      this.scheduleNextProbe();
    }
  }

  /** Розрахунок інтервалу наступного пульсу з експоненційним відкатом */
  private scheduleNextProbe() {
    if (!this.isDocumentVisible) return;

    let delay = INTERVAL_FAST_MS;

    if (this.state.quality === 'ONLINE_SLOW') {
      delay = INTERVAL_SLOW_MS;
    } else if (this.state.quality === 'OFFLINE') {
      // Експоненційний відкат у тунелях: 6s -> 12s -> 24s -> 30s max
      const backoff = BASE_OFFLINE_INTERVAL_MS * Math.pow(1.5, Math.min(this.consecutiveFailures, 4));
      delay = Math.min(backoff, MAX_OFFLINE_INTERVAL_MS);
    }

    this.schedule(delay);
  }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.checkRealConnection();
    }, delay);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(next: NetPulseState): NetPulseState {
    const qualityChanged = next.quality !== this.state.quality;
    const portalChanged = next.isCaptivePortal !== this.state.isCaptivePortal;
    
    this.state = next;

    if (qualityChanged || portalChanged) {
      this.listeners.forEach((l) => l(next));
    }
    return next;
  }

  /** Чи є хоча б мінімальний зв'язок */
  isOnline(): boolean {
    return this.state.quality !== 'OFFLINE';
  }

  /** Чи працює мережа в режимі 2G/EDGE (потяг або гори) */
  isSlow(): boolean {
    return this.state.quality === 'ONLINE_SLOW';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const networkPulse = new NetworkPulse();
