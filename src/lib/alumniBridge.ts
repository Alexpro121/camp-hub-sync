/**
 * IRON ALUMNI BRIDGE — ефемерне перенесення офлайн-паспорта на новий пристрій.
 *
 * Використовується виключно Realtime broadcast-канал: жодного рядка в базі даних,
 * жодного збереження на сервері. Канал живе максимум 3 хвилини.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AlumniPassportEnvelope } from '@/lib/alumniPassport';

export const BRIDGE_TTL_MS = 3 * 60 * 1000;
export const ALUMNI_BROADCAST_CHANNEL = 'iron-alumni-broadcast';

const EVENT_REQUEST = 'passport_request';
const EVENT_TRANSFER = 'passport_transfer';

/** Генерує випадковий 6-значний PIN (криптостійко, якщо доступно) */
export function generateBridgePin(): string {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(100000 + (buf[0] % 900000));
  } catch {
    return String(100000 + Math.floor(Math.random() * 900000));
  }
}

const roomName = (pin: string) => `alumni-bridge-${pin}`;

export interface BridgeHostHandle {
  pin: string;
  expiresAt: number;
  close: () => void;
}

/**
 * СТАРИЙ ПРИСТРІЙ: відкриває кімнату та віддає паспорт на запит нового пристрою.
 */
export function hostPassportBridge(
  passport: AlumniPassportEnvelope,
  callbacks: {
    onSent?: () => void;
    onExpired?: () => void;
    pin?: string;
  } = {},
): BridgeHostHandle {
  const pin = callbacks.pin || generateBridgePin();
  const channel = supabase.channel(roomName(pin), { config: { broadcast: { self: false } } });
  const expiresAt = Date.now() + BRIDGE_TTL_MS;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };

  const timer = window.setTimeout(() => {
    callbacks.onExpired?.();
    close();
  }, BRIDGE_TTL_MS);

  channel
    .on('broadcast', { event: EVENT_REQUEST }, () => {
      channel.send({ type: 'broadcast', event: EVENT_TRANSFER, payload: { passport } });
      callbacks.onSent?.();
    })
    .subscribe();

  return { pin, expiresAt, close };
}

export interface BridgeClaimResult {
  status: 'ok' | 'timeout';
  passport?: AlumniPassportEnvelope;
}

/**
 * НОВИЙ ПРИСТРІЙ: підключається до кімнати за PIN та запитує паспорт.
 */
export function claimPassportBridge(
  pin: string,
  timeoutMs = 45000,
): { promise: Promise<BridgeClaimResult>; cancel: () => void } {
  const channel = supabase.channel(roomName(pin), { config: { broadcast: { self: false } } });
  let settled = false;
  let timer = 0;

  const cleanup = () => {
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };

  const promise = new Promise<BridgeClaimResult>((resolve) => {
    const finish = (result: BridgeClaimResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    timer = window.setTimeout(() => finish({ status: 'timeout' }), timeoutMs);

    channel
      .on('broadcast', { event: EVENT_TRANSFER }, ({ payload }) => {
        const envelope = (payload as { passport?: AlumniPassportEnvelope } | undefined)?.passport;
        if (envelope) finish({ status: 'ok', passport: envelope });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: EVENT_REQUEST, payload: { at: Date.now() } });
          // Повторний запит — якщо старий пристрій підключився трохи пізніше
          window.setTimeout(() => {
            if (!settled) channel.send({ type: 'broadcast', event: EVENT_REQUEST, payload: { at: Date.now() } });
          }, 2500);
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

/** Штаб: надсилає ефемерну подію всім випускникам, які зараз онлайн */
export async function sendAlumniBroadcast(
  kind: AlumniBroadcastKind,
  payload: Omit<AlumniBroadcastPayload, 'sent_at'>,
): Promise<void> {
  const channel = supabase.channel(ALUMNI_BROADCAST_CHANNEL);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
    window.setTimeout(resolve, 4000);
  });
  await channel.send({
    type: 'broadcast',
    event: kind,
    payload: { ...payload, sent_at: Date.now() } satisfies AlumniBroadcastPayload,
  });
  window.setTimeout(() => supabase.removeChannel(channel), 1500);
}

/** Випускник: слухає ефемерні події Штабу */
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
    supabase.removeChannel(channel);
  };
}
