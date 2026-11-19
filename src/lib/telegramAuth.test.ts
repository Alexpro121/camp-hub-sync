import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn(), setSession: vi.fn(), signOut: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke }, auth: { setSession: h.setSession, signOut: h.signOut } },
}));

const session = { access_token: 'access', refresh_token: 'refresh' };
const setTelegram = (value: unknown) => { (window as unknown as { Telegram?: unknown }).Telegram = value; };

async function load() {
  vi.resetModules();
  return import('./telegramAuth');
}

beforeEach(() => {
  h.invoke.mockReset();
  h.setSession.mockReset().mockResolvedValue({ error: null });
  h.signOut.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
  setTelegram({ WebApp: { initData: 'query_id=1&hash=abc', close: vi.fn() } });
});

describe('telegramSignIn', () => {
  it('is not a Mini App without signed initData', async () => {
    setTelegram({ WebApp: { initData: '' } });
    const { isTelegramMiniApp, telegramSignIn } = await load();
    expect(isTelegramMiniApp()).toBe(false);
    expect(await telegramSignIn()).toEqual({ state: 'unlinked' });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('sends only initData and opens the child cabinet chosen by the server', async () => {
    h.invoke.mockResolvedValue({ data: { state: 'ok', role: 'child', childId: 'child-1', teamNumber: 5, shiftId: 's1', session }, error: null });
    const { telegramSignIn } = await load();
    const result = await telegramSignIn();
    expect(h.invoke).toHaveBeenCalledWith('tg-auth', { body: { initData: 'query_id=1&hash=abc' } });
    expect(h.setSession).toHaveBeenCalledWith(session);
    expect(result).toEqual({ state: 'ok', role: 'child', childId: 'child-1', teamNumber: 5, shiftId: 's1' });
    expect(localStorage.getItem('helpsuprov:role')).toBe('child');
    expect(JSON.parse(localStorage.getItem('helpsuprov:session-meta') ?? '{}').childId).toBe('child-1');
  });

  it('drops a stale child role on this device when the server says it is staff', async () => {
    localStorage.setItem('helpsuprov:role', 'child');
    h.invoke.mockResolvedValue({ data: { state: 'ok', role: 'staff', kind: 'supervisor', fullName: 'Коваль Олена', session }, error: null });
    const { telegramSignIn } = await load();
    expect(await telegramSignIn()).toEqual({ state: 'ok', role: 'staff', kind: 'supervisor', fullName: 'Коваль Олена' });
    expect(localStorage.getItem('helpsuprov:role')).toBeNull();
  });

  it('signs out any previous identity when the Telegram account is not linked', async () => {
    localStorage.setItem('helpsuprov:role', 'admin');
    h.invoke.mockResolvedValue({ data: { state: 'unlinked' }, error: null });
    const { telegramSignIn } = await load();
    expect(await telegramSignIn()).toEqual({ state: 'unlinked' });
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.setSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('helpsuprov:role')).toBeNull();
  });

  it('shares one request per launch and retries after an error', async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 500 } } });
    h.invoke.mockResolvedValueOnce({ data: { state: 'pending' }, error: null });
    const { telegramSignIn } = await load();
    expect(await telegramSignIn()).toEqual({ state: 'error', offline: false });
    const [a, b] = await Promise.all([telegramSignIn(), telegramSignIn()]);
    expect(a).toEqual({ state: 'pending' });
    expect(b).toBe(a);
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});
