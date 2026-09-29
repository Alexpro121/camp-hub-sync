/**
 * IRON ALUMNI BRIDGE — ефемерне перенесення офлайн-паспорта без зайвих паролів.
 *
 * Уся ініціатива походить з НОВОГО пристрою (pull-модель):
 * Новий пристрій запитує дані, а старий пристрій автоматично віддає свій паспорт
 * без вимоги вводити паролі.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AlumniPassportEnvelope } from '@/lib/alumniPassport';

export const BRIDGE_TTL_MS = 3 * 60 * 1000; // 3 хвилини життя сесії
export const ALUMNI_BROADCAST_CHANNEL = 'iron-alumni-broadcast';

const EVENT_PULL_REQUEST = 'passport_pull_request';
const EVENT_PULL_RESPONSE = 'passport_pull_response';
const EVENT_ACK = 'passport_pull_ack';

/** Очищення від пробілів та спецсимволів */
export function cleanBridgeIdentifier(raw: string): string {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/** Генерує швидкий одноразовий 6-значний код сесії */
export function generateBridgePin(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return String(100000 + (buf[0] % 900000));
    }
  } catch {
    /* fallback */
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Формує назву кімнати на основі ID паспорта або коду */
export function getBridgeRoomName(identifier: string): string {
  return `alumni-bridge-${cleanBridgeIdentifier(identifier)}`;
}

/** Перевірка валідності структури паспорта */
function isValidPassportEnvelope(obj: any): obj is AlumniPassportEnvelope {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.passport_id !== 'string' || !obj.passport_id.trim()) return false;
  if (typeof obj.checksum !== 'string' || !obj.checksum.trim()) return false;
  if (!obj.child_profile || typeof obj.child_profile !== 'object') return false;
  if (!obj.child_profile.full_name) return false;
  return true;
}

/* =========================================================================
   1. СТАРИЙ ПРИСТРІЙ (Донор) — Пасивно віддає паспорт БЕЗ запиту паролів
========================================================================= */

export interface PassportProviderCallbacks {
  /** Викликається, коли паспорт успішно передано новому пристрою */
  onTransferred?: () => void;
  /** Викликається при завершенні часу очікування */
  onExpired?: () => void;
}

export interface PassportProviderHandle {
  channelId: string;
  close: () => void;
}

/**
 * СТАРИЙ ПРИСТРІЙ:
 * Відкриває фоновий канал роздачі паспорта (за ID паспорта або спільним кодом).
 * Жодних паролів від старого пристрою не вимагається.
 */
export function providePassportForPull(
  passport: AlumniPassportEnvelope,
  customIdentifier?: string,
  callbacks: PassportProviderCallbacks = {},
): PassportProviderHandle {
  const channelId = cleanBridgeIdentifier(customIdentifier || passport.passport_id);
  const room = getBridgeRoomName(channelId);

  const channel = supabase.channel(room, {
    config: { broadcast: { self: false } },
  });

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };

  const timer = window.setTimeout(() => {
    callbacks.onExpired?.();
    close();
  }, BRIDGE_TTL_MS);

  channel
    // 1. Отримано команду "Віддай дані" від нового пристрою
    .on('broadcast', { event: EVENT_PULL_REQUEST }, () => {
      if (closed) return;
      channel.send({
        type: 'broadcast',
        event: EVENT_PULL_RESPONSE,
        payload: { passport, sentAt: Date.now() },
      });
    })
    // 2. Новий пристрій підтвердив успішний прийом даних
    .on('broadcast', { event: EVENT_ACK }, () => {
      if (closed) return;
      callbacks.onTransferred?.();
      window.setTimeout(close, 1000);
    })
    .subscribe();

  return { channelId, close };
}

export interface BridgeHostHandle {
  pin: string;
  expiresAt: number;
  close: () => void;
}

/** Аліас для сумісності з існуючим кодом */
export const hostPassportBridge = (
  passport: AlumniPassportEnvelope,
  callbacks: { onSent?: () => void; onExpired?: () => void; pin?: string } = {},
): BridgeHostHandle => {
  const pin = callbacks.pin || passport.passport_id || generateBridgePin();
  const handle = providePassportForPull(passport, pin, {
    onTransferred: callbacks.onSent,
    onExpired: callbacks.onExpired,
  });
  return {
    pin,
    expiresAt: Date.now() + BRIDGE_TTL_MS,
    close: handle.close,
  };
};

/* =========================================================================
   2. НОВИЙ ПРИСТРІЙ (Отримувач) — Ініціює та тягне дані
========================================================================= */

export interface PassportPullResult {
  status: 'ok' | 'timeout' | 'invalid_payload' | 'cancelled';
  passport?: AlumniPassportEnvelope;
  error?: string;
}

/**
 * НОВИЙ ПРИСТРІЙ:
 * Створює запит на витягування паспорта зі старого пристрою за ID або кодом сесії.
 * Автоматично повторює запити (корисно в потягах з 2G зв'язком).
 */
export function requestPassportPull(
  identifier: string,
  timeoutMs = 45000,
): { promise: Promise<PassportPullResult>; cancel: () => void } {
  const cleanId = cleanBridgeIdentifier(identifier);
  const room = getBridgeRoomName(cleanId);

  const channel = supabase.channel(room, {
    config: { broadcast: { self: false } },
  });

  let settled = false;
  let timeoutTimer = 0;
  let retryInterval = 0;
  let resolveOuter: ((r: PassportPullResult) => void) | null = null;

  const cleanup = () => {
    window.clearTimeout(timeoutTimer);
    window.clearInterval(retryInterval);
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };

  const promise = new Promise<PassportPullResult>((resolve) => {
    resolveOuter = resolve;
    const finish = (result: PassportPullResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    timeoutTimer = window.setTimeout(() => {
      finish({
        status: 'timeout',
        error: 'Старий пристрій не відповів. Переконайтеся, що на старому пристрої відкрито додаток «Залізна Зміна».',
      });
    }, timeoutMs);

    // Слухаємо відповідь із паспортом від старого пристрою
    channel
      .on('broadcast', { event: EVENT_PULL_RESPONSE }, ({ payload }) => {
        const envelope = (payload as { passport?: AlumniPassportEnvelope } | undefined)?.passport;

        if (envelope && isValidPassportEnvelope(envelope)) {
          // Відправляємо старому пристрою підтвердження (ACK), що дані успішно отримано
          channel.send({
            type: 'broadcast',
            event: EVENT_ACK,
            payload: { receivedAt: Date.now() },
          });

          finish({ status: 'ok', passport: envelope });
        } else {
          finish({
            status: 'invalid_payload',
            error: 'Отримано некоректну структуру паспорта.',
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Надсилаємо перший запит "Віддай дані"
          channel.send({
            type: 'broadcast',
            event: EVENT_PULL_REQUEST,
            payload: { requestedAt: Date.now() },
          });

          // Адаптивний ретрай-луп кожні 2 секунди
          retryInterval = window.setInterval(() => {
            if (!settled) {
              channel.send({
                type: 'broadcast',
                event: EVENT_PULL_REQUEST,
                payload: { requestedAt: Date.now() },
              });
            }
          }, 2000);
        }
      });
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolveOuter?.({ status: 'cancelled', error: 'Перенесення скасовано користувачем' });
      }
    },
  };
}

/** Аліас для сумісності з існуючим кодом */
export const claimPassportBridge = (pin: string, timeoutMs = 45000) => {
  return requestPassportPull(pin, timeoutMs);
};

/* =========================================================================
   3. ГЛОБАЛЬНІ ЕФЕМЕРНІ СПОВІЩЕННЯ ДЛЯ ВИПУСКНИКІВ
========================================================================= */

export type AlumniBroadcastKind = 'alumni_raffle' | 'alumni_announcement';

export interface AlumniBroadcastPayload {
  id?: string;
  title: string;
  prize?: string;
  message?: string;
  sent_at: number;
  target_year?: number | null;
}

/**
 * Розсилки зберігаються в таблиці (30 днів), тож їх отримують і ті випускники,
 * що були офлайн або мають старі профілі/старі версії паспорта.
 */
const SEEN_KEY = 'iron_alumni_seen_broadcasts_v1';
const LAST_SEEN_KEY = 'iron_alumni_last_broadcast_at_v1';
const db = supabase as any;

type Row = { id: string; kind: string; title: string; prize: string | null; message: string | null; target_year: number | null; created_at: string };

const readSeen = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const markSeen = (id: string, createdAt: string) => {
  try {
    const next = [id, ...readSeen().filter((x) => x !== id)].slice(0, 200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    const prev = localStorage.getItem(LAST_SEEN_KEY);
    if (!prev || prev < createdAt) localStorage.setItem(LAST_SEEN_KEY, createdAt);
  } catch { /* ignore */ }
};

const toPayload = (r: Row): [AlumniBroadcastKind, AlumniBroadcastPayload] => [
  r.kind === 'alumni_raffle' ? 'alumni_raffle' : 'alumni_announcement',
  {
    id: r.id,
    title: r.title,
    prize: r.prize ?? undefined,
    message: r.message ?? undefined,
    target_year: r.target_year,
    sent_at: new Date(r.created_at).getTime(),
  },
];

/** Штаб: відправка сповіщення всім випускникам (онлайн — одразу, офлайн — при відкритті) */
export async function sendAlumniBroadcast(
  kind: AlumniBroadcastKind,
  payload: Omit<AlumniBroadcastPayload, 'sent_at' | 'id'>,
): Promise<void> {
  const { error } = await db.from('alumni_broadcasts').insert({
    kind,
    title: payload.title.slice(0, 200),
    prize: payload.prize || null,
    message: payload.message ? payload.message.slice(0, 2000) : null,
    target_year: payload.target_year ?? null,
  });
  if (error) throw new Error(error.message || 'Не вдалося надіслати розсилку');
}

/** Штаб: останні розсилки */
export async function listAlumniBroadcasts(limit = 10): Promise<Array<Row>> {
  const { data } = await db.from('alumni_broadcasts').select('*').order('created_at', { ascending: false }).limit(limit);
  return (data as Row[]) ?? [];
}

export async function deleteAlumniBroadcast(id: string): Promise<void> {
  const { error } = await db.from('alumni_broadcasts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Випускник: отримує пропущені розсилки (з моменту останнього перегляду)
 * і слухає нові в реальному часі. Кожна розсилка показується лише один раз.
 */
export function subscribeAlumniBroadcast(
  handler: (kind: AlumniBroadcastKind, payload: AlumniBroadcastPayload) => void,
  opts: { year?: number } = {},
): () => void {
  let stopped = false;
  const deliver = (r: Row) => {
    if (stopped || !r?.id || readSeen().includes(r.id)) return;
    if (r.target_year && opts.year && r.target_year !== opts.year) return;
    markSeen(r.id, r.created_at);
    const [k, p] = toPayload(r);
    handler(k, p);
  };

  // 1. Пропущені (поки додаток був закритий)
  (async () => {
    try {
      let q = db.from('alumni_broadcasts').select('*').order('created_at', { ascending: true }).limit(20);
      const last = localStorage.getItem(LAST_SEEN_KEY);
      if (last) q = q.gt('created_at', last);
      const { data } = await q;
      const rows = (data as Row[]) ?? [];
      // Показуємо лише найсвіжішу, решту позначаємо переглянутими
      rows.slice(0, -1).forEach((r) => markSeen(r.id, r.created_at));
      const latest = rows[rows.length - 1];
      if (latest) deliver(latest);
    } catch { /* офлайн — спробуємо наступного разу */ }
  })();

  // 2. Нові в реальному часі
  const channel = supabase
    .channel(`alumni-broadcasts-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alumni_broadcasts' }, (p) => deliver(p.new as Row))
    .subscribe();

  return () => {
    stopped = true;
    supabase.removeChannel(channel);
  };
}
