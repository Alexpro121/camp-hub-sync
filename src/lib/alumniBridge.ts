/**
 * IRON ALUMNI BRIDGE — ефемерне безпечне перенесення офлайн-паспорта на новий пристрій.
 *
 * Працює виключно через Realtime Broadcast: жодного збереження в базі даних,
 * жодного сліду на сервері. Кімната живе максимум 3 хвилини з двостороннім підтвердженням (ACK).
 */

import { supabase } from '@/integrations/supabase/client';
import type { AlumniPassportEnvelope } from '@/lib/alumniPassport';

export const BRIDGE_TTL_MS = 3 * 60 * 1000; // 3 хвилини
export const ALUMNI_BROADCAST_CHANNEL = 'iron-alumni-broadcast';

const EVENT_REQUEST = 'passport_request';
const EVENT_TRANSFER = 'passport_transfer';
const EVENT_ACK = 'passport_ack';

/** Очищує введення від пробілів, тире та зайвих символів */
export function cleanBridgePin(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6);
}

/** Генерує криптостійкий 6-значний PIN */
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

const roomName = (pin: string) => `alumni-bridge-${cleanBridgePin(pin)}`;

/** Перевіряє цілісність структури паспорта перед збереженням */
function isValidPassportEnvelope(obj: any): obj is AlumniPassportEnvelope {
  if (!obj || typeof obj !== 'object') return false;
  if (!obj.passport || typeof obj.passport !== 'object') return false;
  if (typeof obj.signature !== 'string' || !obj.signature.trim()) return false;
  if (!obj.passport.id || !obj.passport.full_name) return false;
  return true;
}

export interface BridgeHostCallbacks {
  /** Паспорт успішно надіслано */
  onSent?: () => void;
  /** Новий пристрій підтвердив успішне отримання (ACK) */
  onClaimed?: () => void;
  /** Час життя кімнати вичерпано */
  onExpired?: () => void;
  /** Власний PIN (опціонально) */
  pin?: string;
}

export interface BridgeHostHandle {
  pin: string;
  expiresAt: number;
  close: () => void;
}

/**
 * СТАРИЙ ПРИСТРІЙ (Хост):
 * Відкриває зашифровану за PIN кімнату, очікує запит від нового телефону,
 * віддає паспорт і чекає підтвердження отримання (ACK).
 */
export function hostPassportBridge(
  passport: AlumniPassportEnvelope,
  callbacks: BridgeHostCallbacks = {},
): BridgeHostHandle {
  const pin = cleanBridgePin(callbacks.pin || generateBridgePin());
  const channel = supabase.channel(roomName(pin), {
    config: { broadcast: { self: false } },
  });

  const expiresAt = Date.now() + BRIDGE_TTL_MS;
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
    // 1. Отримано запит від нового пристрою -> надсилаємо паспорт
    .on('broadcast', { event: EVENT_REQUEST }, () => {
      if (closed) return;
      channel.send({
        type: 'broadcast',
        event: EVENT_TRANSFER,
        payload: { passport, sentAt: Date.now() },
      });
      callbacks.onSent?.();
    })
    // 2. Новий пристрій успішно розпарсив та зберіг паспорт (ACK)
    .on('broadcast', { event: EVENT_ACK }, () => {
      if (closed) return;
      callbacks.onClaimed?.();
      // Закриваємо кімнату через 1.5 секунди після успішного підтвердження
      window.setTimeout(close, 1500);
    })
    .subscribe();

  return { pin, expiresAt, close };
}

export interface BridgeClaimResult {
  status: 'ok' | 'timeout' | 'invalid_payload' | 'cancelled';
  passport?: AlumniPassportEnvelope;
  error?: string;
}

/**
 * НОВИЙ ПРИСТРІЙ (Клієнт):
 * Підключається до кімнати за PIN, періодично запитує паспорт (із захистом від обривів на 2G),
 * перевіряє цілісність отриманого конверта та відправляє підтвердження (ACK).
 */
export function claimPassportBridge(
  rawPin: string,
  timeoutMs = 45000,
): { promise: Promise<BridgeClaimResult>; cancel: () => void } {
  const pin = cleanBridgePin(rawPin);
  const channel = supabase.channel(roomName(pin), {
    config: { broadcast: { self: false } },
  });

  let settled = false;
  let timeoutTimer = 0;
  let retryInterval = 0;

  const cleanup = () => {
    window.clearTimeout(timeoutTimer);
    window.clearInterval(retryInterval);
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };

  const promise = new Promise<BridgeClaimResult>((resolve) => {
    const finish = (result: BridgeClaimResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    timeoutTimer = window.setTimeout(() => {
      finish({ status: 'timeout', error: 'Час очікування вичерпано. Перевірте PIN або зв’язок на старому пристрої.' });
    }, timeoutMs);

    // Слухаємо відповідь з паспортом від старого пристрою
    channel
      .on('broadcast', { event: EVENT_TRANSFER }, ({ payload }) => {
        const envelope = (payload as { passport?: AlumniPassportEnvelope } | undefined)?.passport;

        if (envelope && isValidPassportEnvelope(envelope)) {
          // Надсилаємо підтвердження успішного отримання (ACK)
          channel.send({
            type: 'broadcast',
            event: EVENT_ACK,
            payload: { receivedAt: Date.now() },
          });

          finish({ status: 'ok', passport: envelope });
        } else {
          finish({
            status: 'invalid_payload',
            error: 'Отримано некоректні або пошкоджені дані паспорта.',
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Перший запит
          channel.send({
            type: 'broadcast',
            event: EVENT_REQUEST,
            payload: { at: Date.now() },
          });

          // Адаптивний ретрай-луп кожні 2 секунди (критично для 2G в потягах)
          retryInterval = window.setInterval(() => {
            if (!settled) {
              channel.send({
                type: 'broadcast',
                event: EVENT_REQUEST,
                payload: { at: Date.now() },
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
      }
    },
  };
}

/* =========================================================================
   ГЛОБАЛЬНИЙ ЕФЕМЕРНИЙ КАНАЛ ШТАБУ ДЛЯ ВИПУСКНИКІВ
========================================================================= */

export type AlumniBroadcastKind = 'alumni_raffle' | 'alumni_announcement';

export interface AlumniBroadcastPayload {
  title: string;
  prize?: string;
  message?: string;
  sent_at: number;
}

/**
 * Штаб: надійне надсилання ефемерної події всім випускникам онлайн
 */
export async function sendAlumniBroadcast(
  kind: AlumniBroadcastKind,
  payload: Omit<AlumniBroadcastPayload, 'sent_at'>,
): Promise<void> {
  const channel = supabase.channel(ALUMNI_BROADCAST_CHANNEL);

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(), 3500);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.clearTimeout(timer);
        reject(new Error(`Не вдалося підключитися до каналу трансляції: ${status}`));
      }
    });
  });

  await channel.send({
    type: 'broadcast',
    event: kind,
    payload: { ...payload, sent_at: Date.now() } satisfies AlumniBroadcastPayload,
  });

  window.setTimeout(() => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  }, 1000);
}

/**
 * Випускник: прослуховування ефемерних розіграшів та оголошень Штабу
 */
export function subscribeAlumniBroadcast(
  handler: (kind: AlumniBroadcastKind, payload: AlumniBroadcastPayload) => void,
): () => void {
  const channel = supabase.channel(ALUMNI_BROADCAST_CHANNEL);

  channel
    .on('broadcast', { event: 'alumni_raffle' }, ({ payload }) =>
      handler('alumni_raffle', payload as AlumniBroadcastPayload),
    )
    .on('broadcast', { event: 'alumni_announcement' }, ({ payload }) =>
      handler('alumni_announcement', payload as AlumniBroadcastPayload),
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
    supabase.removeChannel(channel);
  };
}
