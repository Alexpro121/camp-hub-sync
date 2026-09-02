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

// Інтервали активного режиму (екран увімкнено)
const PULSE_TIMEOUT_MS = 2500;          // Швидкий таймаут для 2G
const SLOW_THRESHOLD_MS = 900;          // Поріг 2G / перевантаженого Starlink
const INTERVAL_FAST_MS = 30000;         // Стабільний 4G (активний)
const INTERVAL_SLOW_MS = 12000;         // 2G / EDGE (активний)
const BASE_OFFLINE_INTERVAL_MS = 5000;  // Пошук мережі у тунелі (активний)
const MAX_OFFLINE_INTERVAL_MS = 25000;  // Максимальний відкат

// Інтервали фонового режиму (екран вимкнено / телефон у кишені)
const INTERVAL_BG_ONLINE_MS = 45000;    // Фонова перевірка при наявності зв'язку
const INTERVAL_BG_OFFLINE_MS = 20000;   // Фоновий пошук мережі після виїзду з тунелю

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

    // 1. Миттєва реакція на апаратні зміни мережі
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

    // 2. Зміна видимості: адаптуємо інтервали, НЕ зупиняючи пульс у фоні
    document.addEventListener('visibilitychange', () => {
      this.isDocumentVisible = document.visibilityState === 'visible';
      if (this.isDocumentVisible) {
        // Телефон розблокували — робимо негайну швидку перевірку
        void this.checkRealConnection(true);
      } else {
        // У фоні переплановуємо на енергоефективні фонові таймінги
        this.scheduleNextProbe();
      }
    });

    // 3. Network Information API (моніторинг типу підключення)
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

    // Перший запуск
    this.schedule(150);
  }

  /**
   * Створює автономний Inline Web Worker, таймери якого не блокуються
   * мобільними браузерами при згортанні вкладки чи блокуванні екрана.
   */
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
      // Fallback до звичайних таймерів, якщо Worker заблоковано CSP
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

  /**
   * Активний Micro-Ping із нульовим споживанням трафіку (HEAD),
   * що працює як на передньому плані, так і у фоновому режимі.
   */
  async checkRealConnection(force = false): Promise<NetPulseState> {
    if (this.inFlightCtrl && !force) return this.state;

    // Апаратний офлайн
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

      // Детекція Captive Portal (фейковий інтернет на Wi-Fi потяга)
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

      // Успішний зв'язок
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

  /**
   * Розрахунок інтервалу для активного та фонового режимів
   */
  private scheduleNextProbe() {
    let delay: number;

    if (!this.isDocumentVisible) {
      // ФОНОВИЙ РЕЖИМ (екран згасло або вкладку згорнуто)
      if (this.state.quality === 'OFFLINE') {
        delay = INTERVAL_BG_OFFLINE_MS; // Кожні 20 секунд перевіряємо, чи вийшов потяг з тунелю
      } else {
        delay = INTERVAL_BG_ONLINE_MS;  // Кожні 45 секунд підтримуємо актуальний стан
      }
    } else {
      // АКТИВНИЙ РЕЖИМ (екран увімкнено)
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

    // Рандомізований джиттер (±15%) для запобігання пікових сплесків
    const jitter = delay * 0.15 * (Math.random() * 2 - 1);
    this.schedule(Math.round(delay + jitter));
  }

  private schedule(delay: number) {
    this.clearTimer();

    // Якщо доступний фоновий Worker — плануємо через нього (не засинає у фоні)
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

  /**
   * Асинхронне очікування появи інтернету (працює навіть у фоновому режимі)
   */
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
