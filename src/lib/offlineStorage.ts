/**
 * Надійний шар збереження офлайн-черг для проєкту «Залізна Зміна».
 *
 * Гарантії:
 *  • Послідовний (серіалізований) запис — жодних гонок між IndexedDB та LocalStorage.
 *  • Подвійне дзеркало: IndexedDB + LocalStorage. При читанні джерела зливаються за `id`.
 *  • Синхронізація між вкладками через BroadcastChannel.
 *  • Ніколи не кидає винятків назовні (Safari Private Mode, переповнена квота).
 */

export interface StoredRecord {
  id: string;
  [key: string]: unknown;
}

type WriteFn = (value: unknown) => Promise<void> | void;

/** Послідовна черга записів — усі write проходять один за одним. */
export function createSerialWriter(write: WriteFn) {
  let chain: Promise<void> = Promise.resolve();
  return (value: unknown): Promise<void> => {
    chain = chain.then(async () => {
      try {
        await write(value);
      } catch {
        /* збереження не має ламати UI */
      }
    });
    return chain;
  };
}

/** Зливає два джерела за `id`, віддаючи перевагу свіжішому запису. */
export function mergeById<T extends StoredRecord>(
  primary: T[] | null | undefined,
  secondary: T[] | null | undefined,
  freshness: (item: T) => number = (i) => Number((i as any).createdAt ?? (i as any).created_at ?? 0),
): T[] {
  const map = new Map<string, T>();
  for (const list of [primary ?? [], secondary ?? []]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
      const existing = map.get(item.id);
      if (!existing || freshness(item) > freshness(existing)) {
        map.set(item.id, item);
      }
    }
  }
  return [...map.values()].sort((a, b) => freshness(a) - freshness(b));
}

export function safeLocalGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function safeLocalSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Канал синхронізації черг між вкладками одного пристрою. */
export function createChannel(name: string, onMessage: (data: any) => void) {
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(name);
      channel.onmessage = (e) => onMessage(e.data);
    }
  } catch {
    channel = null;
  }
  return {
    post(data: unknown) {
      try {
        channel?.postMessage(data);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * М'який міжвкладковий лок, щоб дві вкладки не відправляли одну дію двічі.
 * Лізинг короткий (за замовчуванням 30 с) — «мертва» вкладка не блокує синхронізацію назавжди.
 */
export function acquireFlushLease(key: string, ttlMs = 30000): { release: () => void } | null {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const held = Number(raw);
      if (Number.isFinite(held) && now - held < ttlMs) return null;
    }
    localStorage.setItem(key, String(now));
    return {
      release() {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    // Без localStorage працюємо без локу (гірше, але не блокуємо синхронізацію)
    return { release: () => {} };
  }
}

/** Експоненційна затримка з джитером для повторних спроб. */
export function backoffDelay(tries: number, baseMs = 4000, maxMs = 5 * 60 * 1000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, tries - 1));
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}

/** Помилки, які не має сенсу повторювати (бізнес-логіка або постійні збої БД). */
const PERMANENT_ERROR_REGEX =
  /insufficient_funds|forbidden|not_authenticated|unauthorized|fair_closed|child_not_found|not_found|invalid_amount|invalid input|awaiting_target_consent|violates row-level security|row-level security|violates foreign key|violates check constraint|duplicate key|null value in column|does not exist|22p02|23503|23505|42501|42703|400|401|403|404|409|422/i;

export function isPermanentDbError(error: unknown): boolean {
  const err = error as any;
  const code = String(err?.code ?? '');
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const text = `${err?.message ?? ''} ${err?.details ?? ''} ${err?.hint ?? ''} ${code}`;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
  if (/^(22|23|42)/.test(code)) return true;
  if (/timeout|failed to fetch|network|aborted|econn|503|502|504|429/i.test(text)) return false;
  return PERMANENT_ERROR_REGEX.test(text);
}
