/**
 * Fair (ярмарок) payment primitives: schedule detection, QR payload encoding
 * and a self-contained short code used when the camera is unavailable.
 */

export const FAIR_QR_TYPE = 'CAMP_FAIR_PAYMENT';
/** A generated QR stays valid for two hours. */
export const FAIR_QR_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const FAIR_MIN_AMOUNT = 1;
export const FAIR_MAX_AMOUNT = 10000;
export const FAIR_PRESETS = [10, 20, 50, 100, 200];

const FAIR_RE = /(ярмарок|ярмарка|ярмарки|ярмарков|fair|market)/i;

export interface FairScheduleLike {
  title?: string | null;
  description?: string | null;
}

/** True when the given day's agenda contains a fair-like event. */
export const isFairScheduleActive = (
  items: FairScheduleLike[] | null | undefined,
  _currentDate: Date = new Date(),
): boolean => {
  if (!Array.isArray(items)) return false;
  return items.some((i) => FAIR_RE.test(`${i?.title ?? ''} ${i?.description ?? ''}`));
};

export interface FairQrPayload {
  type: typeof FAIR_QR_TYPE;
  tx_id: string;
  supervisor_id: string | null;
  supervisor_team: number | null;
  supervisor_name?: string | null;
  amount: number;
  timestamp: number;
  code: string;
}

const HEX = '0123456789abcdef';
const randHex = (n: number) => {
  const bytes = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => HEX[b % 16]).join('');
};

/**
 * Short code layout (16 hex chars): 6 random · 4 amount · 6 minutes-since-epoch.
 * It is fully self-contained, so a child can type it in when the camera fails.
 */
export const encodeFairCode = (amount: number, timestamp: number): string => {
  const amt = Math.max(0, Math.min(0xffff, Math.round(amount))).toString(16).padStart(4, '0');
  const mins = (Math.floor(timestamp / 60000) % 0xffffff).toString(16).padStart(6, '0');
  return `${randHex(6)}${amt}${mins}`.toLowerCase();
};

export const formatFairCode = (code: string) =>
  (code.match(/.{1,4}/g) || []).join('-').toUpperCase();

export const normalizeFairCode = (input: string) =>
  input.replace(/[^0-9a-fA-F]/g, '').toLowerCase();

export interface DecodedFairCode {
  code: string;
  amount: number;
  timestamp: number;
  tx_id: string;
}

/** Deterministic UUID derived from the short code, so retries never double-charge. */
export const txIdFromCode = (code: string): string => {
  const base = code.padEnd(16, '0').slice(0, 16);
  const hex = (base + base.split('').reverse().join('')).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

export const decodeFairCode = (raw: string): DecodedFairCode | null => {
  const code = normalizeFairCode(raw);
  if (code.length !== 16) return null;
  const amount = parseInt(code.slice(6, 10), 16);
  const mins = parseInt(code.slice(10, 16), 16);
  if (!Number.isFinite(amount) || amount < FAIR_MIN_AMOUNT || amount > FAIR_MAX_AMOUNT) return null;
  if (!Number.isFinite(mins)) return null;

  // Rebuild the absolute timestamp from the truncated minute counter.
  const period = 0xffffff;
  const nowMins = Math.floor(Date.now() / 60000);
  let full = Math.floor(nowMins / period) * period + mins;
  if (full > nowMins + 60) full -= period;

  return { code, amount, timestamp: full * 60000, tx_id: txIdFromCode(code) };
};

export const createFairPayload = (opts: {
  amount: number;
  supervisorId?: string | null;
  supervisorTeam?: number | null;
  supervisorName?: string | null;
}): FairQrPayload => {
  const timestamp = Date.now();
  const code = encodeFairCode(opts.amount, timestamp);
  return {
    type: FAIR_QR_TYPE,
    tx_id: txIdFromCode(code),
    supervisor_id: opts.supervisorId ?? null,
    supervisor_team: opts.supervisorTeam ?? null,
    supervisor_name: opts.supervisorName ?? null,
    amount: Math.round(opts.amount),
    timestamp,
    code,
  };
};

export interface FairParseOk { ok: true; payload: FairQrPayload; reason?: undefined }
export interface FairParseFail { ok: false; payload?: undefined; reason: 'invalid' | 'expired' }
export type FairParseResult = FairParseOk | FairParseFail;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict parser: anything that is not a well-formed, fresh fair QR is rejected. */
export const parseFairQr = (raw: string): FairParseResult => {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'invalid' };
  if (data.type !== FAIR_QR_TYPE) return { ok: false, reason: 'invalid' };
  if (typeof data.tx_id !== 'string' || !UUID_RE.test(data.tx_id)) return { ok: false, reason: 'invalid' };

  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount < FAIR_MIN_AMOUNT || amount > FAIR_MAX_AMOUNT) {
    return { ok: false, reason: 'invalid' };
  }
  const timestamp = Number(data.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { ok: false, reason: 'invalid' };
  if (Date.now() - timestamp > FAIR_QR_MAX_AGE_MS) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    payload: {
      type: FAIR_QR_TYPE,
      tx_id: data.tx_id,
      supervisor_id: typeof data.supervisor_id === 'string' ? data.supervisor_id : null,
      supervisor_team: Number.isFinite(Number(data.supervisor_team)) ? Number(data.supervisor_team) : null,
      supervisor_name: typeof data.supervisor_name === 'string' ? data.supervisor_name : null,
      amount,
      timestamp,
      code: typeof data.code === 'string' ? data.code : '',
    },
  };
};

export interface FairAmountValid { ok: true; amount: number; error?: undefined }
export interface FairAmountInvalid { ok: false; amount?: undefined; error: string }
export type FairAmountResult = FairAmountValid | FairAmountInvalid;

/** Validates a manually typed amount from the supervisor keypad. */
export const validateFairAmount = (input: string): FairAmountResult => {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Введіть суму' };
  if (!/^\d{1,6}$/.test(trimmed)) return { ok: false, error: 'Лише цілі числа без символів' };
  const amount = parseInt(trimmed, 10);
  if (!Number.isInteger(amount) || amount < FAIR_MIN_AMOUNT) return { ok: false, error: 'Сума має бути більшою за 0' };
  if (amount > FAIR_MAX_AMOUNT) return { ok: false, error: `Максимум ${FAIR_MAX_AMOUNT} Айрон-доларів` };
  return { ok: true, amount };
};