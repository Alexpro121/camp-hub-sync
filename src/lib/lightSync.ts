/**
 * «Легкі сигнали» для слабкої мережі (потяг, 300 телефонів на одному Wi-Fi).
 *
 * Принцип: сервер розсилає лише крихітний сигнал «щось змінилось» (≈100 байт),
 * а кожен телефон сам дотягує тільки свій шматок даних — і не одночасно з усіма,
 * а у випадковий момент вікна. Збережена копія показується одразу й без мережі;
 * невдалий запит ніколи не стирає те, що вже є на екрані.
 */

/** Випадкова затримка, щоб 300 пристроїв не пішли по дані в ту саму мить. */
export function spreadDelay(maxMs: number, minMs = 300, random: () => number = Math.random): number {
  return Math.round(minMs + random() * Math.max(0, maxMs - minMs));
}

/** Скільки чекати після сигналу: на повільній мережі вікно ширше. */
export function signalWindowMs(quality?: string | null): number {
  return quality === 'ONLINE_SLOW' ? 20_000 : 8_000;
}

export interface Cached<T> { at: number; data: T }

export function readCache<T>(key: string, maxAgeMs = 3 * 86_400_000): Cached<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached<T>;
    if (!parsed || typeof parsed.at !== 'number' || Date.now() - parsed.at > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies Cached<T>));
  } catch { /* переповнене сховище не повинно ламати екран */ }
}

/**
 * Відкладене перезавантаження за сигналом: серія подій зливається в одне завантаження,
 * а момент обирається випадково у вікні, щоб усі пристрої не пішли по дані разом.
 */
export function signalReload(load: () => unknown, windowMs: () => number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() { clearTimeout(timer); timer = setTimeout(() => { void load(); }, spreadDelay(windowMs())); },
    cancel() { clearTimeout(timer); },
  };
}

/** Чи минуло достатньо часу з останнього повного завантаження (щоб не качати все при кожному розблокуванні). */
export function isStale(lastAt: number, minGapMs = 90_000, now = Date.now()): boolean {
  return now - lastAt >= minGapMs;
}
