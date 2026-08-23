/**
 * Fair (Ярмарок) платіжні примітиви: розпізнавання розкладу, кодування QR,
 * 5-значні PIN-коди та підтримка безконтактних Air Pay запитів.
 */

export const FAIR_QR_TYPE = 'CAMP_FAIR_PAYMENT';
/** Згенерований динамічний QR-код дійсний протягом 2 годин */
export const FAIR_QR_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const FAIR_MIN_AMOUNT = 1;
export const FAIR_MAX_AMOUNT = 10000;
export const FAIR_PRESETS = [10, 20, 50, 100, 200];

/** Регулярний вираз для перевірки наявності ярмарку в розкладі дня (всі відмінки) */
const FAIR_RE = /(ярмарок|ярмарк|ярмарку|ярмарці|ярмарком|fair|market|маркет|базар|стенд)/i;

export interface FairScheduleLike {
  title?: string | null;
  description?: string | null;
}

/** Перевіряє, чи є в розкладі на сьогодні подія ярмарку */
export const isFairScheduleActive = (
  items: FairScheduleLike[] | null | undefined,
  _currentDate: Date = new Date(),
): boolean => {
  if (!Array.isArray(items)) return false;
  return items.some((i) => FAIR_RE.test(`${i?.title ?? ''} ${i?.description ?? ''}`));
};

/** Структура корисного навантаження QR-коду касира */
export interface FairQrPayload {
  type: typeof FAIR_QR_TYPE;
  tx_id: string;
  supervisor_id: string | null;
  supervisor_team: number | null;
  supervisor_name?: string | null;
  amount: number;
  timestamp: number;
  code: string;
  /** Багаторазовий роздрукований цінник на товар */
  is_reusable?: boolean;
  /** ID товару в таблиці `fair_preset_codes` */
  code_id?: string | null;
  /** Назва товару, наприклад "Браслет" або "Кепка" */
  label?: string | null;
}

/** Структура Air Pay Push-запиту від дитини до супроводу */
export interface FairPushPaymentRequest {
  requestId: string;
  childName: string;
  childTeam: number;
  amount: number;
  targetTeam: number;
  timestamp: number;
  childId?: string;
}

/** Структура відповіді супроводу на Air Pay запит */
export interface FairPushPaymentResponse {
  requestId: string;
  newBalance?: number;
  amount?: number;
  reason?: string;
}

/** Довжина 5-значного цифрового коду для ручного введення */
export const FAIR_CODE_LENGTH = 5;

/** Генерація 5-значного коду каси (наприклад: "87608") */
export const generateShortCode = (): string =>
  String(Math.floor(10000 + Math.random() * 90000));

/** Форматування 5-значного коду */
export const formatFairCode = (code: string): string => code;

/** Очищення від нечислових символів */
export const normalizeFairCode = (input: string): string =>
  input.replace(/\D/g, '').slice(0, FAIR_CODE_LENGTH);

export const isValidFairCode = (input: string): boolean =>
  normalizeFairCode(input).length === FAIR_CODE_LENGTH;

/** Стандартизований формат відображення валюти "Айрон-долари" */
export const formatIronDollars = (amount: number): string => 
  `${Math.round(amount)} А$`;

/** Безпечна генерація UUID для унікальних транзакцій */
export const randomUuid = (): string => {
  if (typeof crypto !== 'undefined') {
    if ('randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if ('getRandomValues' in crypto) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/** Створення об'єкта динамічного чека для касира */
export const createFairPayload = (opts: {
  amount: number;
  supervisorId?: string | null;
  supervisorTeam?: number | null;
  supervisorName?: string | null;
}): FairQrPayload => {
  const timestamp = Date.now();
  const code = generateShortCode();
  return {
    type: FAIR_QR_TYPE,
    tx_id: randomUuid(),
    supervisor_id: opts.supervisorId ?? null,
    supervisor_team: opts.supervisorTeam ?? null,
    supervisor_name: opts.supervisorName ?? null,
    amount: Math.round(opts.amount),
    timestamp,
    code,
  };
};

/** Створення багаторазового цінника для паперових стендів */
export const createReusableFairPayload = (opts: {
  codeId: string;
  amount: number;
  label: string;
  supervisorId?: string | null;
  supervisorTeam?: number | null;
}): FairQrPayload => ({
  type: FAIR_QR_TYPE,
  tx_id: randomUuid(),
  is_reusable: true,
  code_id: opts.codeId,
  amount: Math.round(opts.amount),
  label: opts.label,
  supervisor_id: opts.supervisorId ?? null,
  supervisor_team: opts.supervisorTeam ?? null,
  timestamp: Date.now(),
  code: '',
});

export interface FairParseOk { ok: true; payload: FairQrPayload; reason?: undefined }
export interface FairParseFail { ok: false; payload?: undefined; reason: 'invalid' | 'expired' }
export type FairParseResult = FairParseOk | FairParseFail;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Строгий парсер сканованого QR-коду з перевіркою терміну дії */
export const parseFairQr = (raw: string): FairParseResult => {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  
  if (!data || typeof data !== 'object') return { ok: false, reason: 'invalid' };
  if (data.type !== FAIR_QR_TYPE) return { ok: false, reason: 'invalid' };

  // 1. Обробка багаторазового паперового цінника
  if (data.is_reusable === true) {
    if (typeof data.code_id !== 'string' || !UUID_RE.test(data.code_id)) {
      return { ok: false, reason: 'invalid' };
    }
    const amt = Number(data.amount);
    if (!Number.isInteger(amt) || amt < FAIR_MIN_AMOUNT || amt > FAIR_MAX_AMOUNT) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      payload: {
        type: FAIR_QR_TYPE,
        tx_id: randomUuid(),
        supervisor_id: typeof data.supervisor_id === 'string' ? data.supervisor_id : null,
        supervisor_team: Number.isFinite(Number(data.supervisor_team)) ? Number(data.supervisor_team) : null,
        supervisor_name: typeof data.supervisor_name === 'string' ? data.supervisor_name : null,
        amount: amt,
        timestamp: Date.now(),
        code: '',
        is_reusable: true,
        code_id: data.code_id,
        label: typeof data.label === 'string' ? data.label : null,
      },
    };
  }

  // 2. Обробка динамічного QR-коду термінала
  if (typeof data.tx_id !== 'string' || !UUID_RE.test(data.tx_id)) return { ok: false, reason: 'invalid' };

  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount < FAIR_MIN_AMOUNT || amount > FAIR_MAX_AMOUNT) {
    return { ok: false, reason: 'invalid' };
  }
  
  const timestamp = Number(data.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { ok: false, reason: 'invalid' };
  
  // Перевірка часу дії (2 години)
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

/** Валідація введеної касиром суми покупки */
export const validateFairAmount = (input: string): FairAmountResult => {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Введіть суму' };
  if (!/^\d{1,6}$/.test(trimmed)) return { ok: false, error: 'Лише цілі числа' };
  
  const amount = parseInt(trimmed, 10);
  if (!Number.isInteger(amount) || amount < FAIR_MIN_AMOUNT) {
    return { ok: false, error: 'Сума має бути більшою за 0' };
  }
  if (amount > FAIR_MAX_AMOUNT) {
    return { ok: false, error: `Максимум ${formatIronDollars(FAIR_MAX_AMOUNT)}` };
  }
  
  return { ok: true, amount };
};
