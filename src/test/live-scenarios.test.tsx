/**
 * Live scenario suite: camera scanner, supervisor realtime HUD,
 * offline IndexedDB sync and the A4 print layout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------- mocks ---------------------------------- */

const rpc = vi.fn();
const channels = new Map<string, any>();
const makeChannel = (name: string) => {
  const handlers: Record<string, ((e: any) => void)[]> = {};
  const ch: any = {
    name,
    on: (_type: string, filter: any, cb: (e: any) => void) => {
      const key = filter?.event ?? _type;
      (handlers[key] ||= []).push(cb);
      return ch;
    },
    subscribe: vi.fn(async () => 'SUBSCRIBED'),
    send: vi.fn(async () => 'ok'),
    emit: (event: string, payload: any) => (handlers[event] || []).forEach((h) => h({ payload })),
  };
  channels.set(name, ch);
  return ch;
};

const fromResult: any = { data: [], error: null };
const builder = () => {
  const b: any = {};
  ['select', 'eq', 'order', 'limit', 'insert', 'update', 'maybeSingle', 'single'].forEach((m) => {
    b[m] = vi.fn(() => b);
  });
  b.then = (res: any) => Promise.resolve(fromResult).then(res);
  return b;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: any[]) => rpc(...a),
    from: () => builder(),
    channel: (n: string) => makeChannel(n),
    removeChannel: vi.fn(),
    auth: { getUser: async () => ({ data: { user: { id: 'sup-1' } } }) },
  },
}));

vi.mock('@/context/DynamicIslandContext', () => ({
  useDynamicIsland: () => ({ showError: vi.fn(), show: vi.fn(), hide: vi.fn(), showSuccess: vi.fn() }),
}));

const jsQRMock = vi.fn();
vi.mock('jsqr', () => ({ default: (...a: any[]) => jsQRMock(...a) }));

import ApplePayScannerModal from '@/components/fair/ApplePayScannerModal';
import SupervisorFairView from '@/components/fair/SupervisorFairView';
import { queuedIronDollarChange, flushQueue, readQueue, ready } from '@/lib/offline';

const SUP = '11111111-1111-4111-8111-111111111111';
const TX = '22222222-2222-4222-8222-222222222222';
const qrPayload = {
  type: 'CAMP_FAIR_PAYMENT',
  tx_id: TX,
  supervisor_id: SUP,
  supervisor_team: 5,
  amount: 50,
  timestamp: Date.now(),
  code: '58492',
};

/** Makes the modal's decode loop yield our payload on the first frame. */
function primeCamera(data: string) {
  jsQRMock.mockReturnValue({ data, location: null });
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
  HTMLVideoElement.prototype.play = vi.fn(async () => undefined);
  HTMLVideoElement.prototype.pause = vi.fn();
  (HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ({
    drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
    rotate: vi.fn(), fillRect: vi.fn(), scale: vi.fn(), set fillStyle(_v: any) {}, set globalAlpha(_v: any) {},
  }));
  (navigator as any).mediaDevices = {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  };
}

beforeEach(() => {
  rpc.mockReset();
  channels.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

/* ---------------------- SCENARIO 3: camera scanner ----------------------- */

describe('SCENARIO 3 · Apple Pay camera scanner', () => {
  it('scanning -> processing -> success (receipt + confetti canvas)', async () => {
    primeCamera(JSON.stringify(qrPayload));
    rpc.mockResolvedValue({ data: { status: 'ok', balance_after: 150, tx_id: TX }, error: null });
    const onPaid = vi.fn();

    render(<ApplePayScannerModal open balance={200} onClose={() => {}} onPaid={onPaid} childName="Іван" childTeam={5} />);
    expect(screen.getByText('Наведи камеру на QR-код')).toBeInTheDocument();

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0][0]).toBe('pay_fair_purchase');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tx_id: TX, p_amount: 50 });

    await waitFor(() => expect(screen.getByText('Оплачено')).toBeInTheDocument());
    expect(onPaid).toHaveBeenCalledWith(150);
    expect(document.querySelector('.apple-checkmark-path')).toBeTruthy();
    expect(document.querySelector('.success-bg-circle')).toBeTruthy();
    expect(document.querySelector('canvas')).toBeTruthy();
    expect(screen.getByText(/22222222/i)).toBeInTheDocument();
  });

  it('blocks payment when the balance is too low', async () => {
    primeCamera(JSON.stringify(qrPayload));
    rpc.mockResolvedValue({ data: { status: 'insufficient_funds', balance: 10 }, error: null });
    render(<ApplePayScannerModal open balance={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Недостатньо Айрон-доларів/)).toBeInTheDocument());
  });

  it('rejects an expired QR code without calling the RPC', async () => {
    primeCamera(JSON.stringify({ ...qrPayload, timestamp: Date.now() - 3 * 60 * 60 * 1000 }));
    render(<ApplePayScannerModal open balance={500} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/QR-код застарів/)).toBeInTheDocument());
    expect(rpc).not.toHaveBeenCalled();
  });
});

/* ------------------ SCENARIO 4: supervisor realtime HUD ------------------ */

describe('SCENARIO 4 · Supervisor realtime HUD', () => {
  it('shows the success plate on FAIR_PAYMENT_SUCCESS and hides it after 2500 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SupervisorFairView myTeam={5} />);

    await waitFor(() => expect(channels.has('supervisor_fair_sup-1')).toBe(true));
    const before = document.querySelector('svg')?.outerHTML;

    await act(async () => {
      channels.get('supervisor_fair_sup-1').emit('FAIR_PAYMENT_SUCCESS', {
        childName: 'Іван Петренко', teamNumber: 5, amount: 50, txId: TX,
      });
    });

    expect(await screen.findByText('+50 💰')).toBeInTheDocument();
    expect(screen.getByText('Іван Петренко (Команда №5)')).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(2600); });
    await waitFor(() => expect(screen.queryByText('+50 💰')).toBeNull());

    // QR rotated to a fresh tx_id
    await waitFor(() => expect(document.querySelector('svg')?.outerHTML).not.toBe(before));
    vi.useRealTimers();
  });
});

/* --------------------- SCENARIO 5: offline IndexedDB --------------------- */

describe('SCENARIO 5 · Offline queue + sync', () => {
  it('queues offline with an idempotency key and replays exactly once', async () => {
    await ready;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const res = await queuedIronDollarChange({ childId: 'child-1', amount: 25, reason: 'Буковель', label: '+25' });
    expect(res.queued).toBe(true);
    expect(rpc).not.toHaveBeenCalled();

    const q = readQueue().filter((a) => a.fn === 'increment_iron_dollars');
    expect(q).toHaveLength(1);
    expect(q[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    rpc.mockResolvedValue({ data: 125, error: null });
    const flushed = await flushQueue();

    expect(flushed.failed).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('increment_iron_dollars');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_child_id: 'child-1', p_amount: 25 });
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe(q[0].idempotencyKey);

    // Queue drained -> a second flush cannot double-credit.
    expect(readQueue()).toHaveLength(0);
    await flushQueue();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

/* ----------------------- SCENARIO 6: A4 print grid ----------------------- */

describe('SCENARIO 6 · A4 3x3 print layout', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');
  const printBlock = css.slice(css.indexOf('@media print'));

  it('prints A4 portrait with a 3-column grid', () => {
    expect(printBlock).toContain('size: A4 portrait');
    expect(printBlock).toContain('grid-template-columns: repeat(3, 1fr)');
  });

  it('uses dashed cut lines and page-break-safe cards sized for 3 rows', () => {
    expect(printBlock).toContain('border: 1.5px dashed #333333');
    expect(printBlock).toContain('page-break-inside: avoid');
    const h = Number(printBlock.match(/height: (\d+)mm/)![1]);
    const gap = Number(printBlock.match(/gap: (\d+)mm/)![1]);
    expect(h * 3 + gap * 2).toBeLessThanOrEqual(297 - 12); // fits A4 minus 6mm margins
  });

  it('hides everything except the print sheet', () => {
    expect(printBlock).toContain('body * { visibility: hidden');
    expect(printBlock).toContain('#fair-print-sheet');
    expect(printBlock).toContain('.no-print { display: none');
  });
});
