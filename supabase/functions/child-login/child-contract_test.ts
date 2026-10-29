import { assertEquals } from 'jsr:@std/assert';

Deno.test('child login fails closed without a shift and marks login only after session success', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  let handler: (r: Request) => Promise<Response> = async () => new Response();
  let shifts: { id: string; start_date: string; end_date: string }[] = [];
  let updates = 0;
  let failSession = false;
  const svc = { from(table: string) {
    const q = {
      select() { return q; }, is() { return q; }, order() { return q; }, in() { return q; }, eq() { return q; },
      update() { updates++; return q; },
      maybeSingle() { return Promise.resolve({ data: { id: '11111111-1111-4111-8111-111111111111', shift_id: 'shift' }, error: null }); },
      then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: table === 'shifts' ? shifts : [], error: null }).then(resolve); },
    }; return q;
  } };
  const globals = globalThis as typeof globalThis & { childTestSvc?: unknown; childTestRegister?: unknown; childTestSession?: unknown };
  globals.childTestSvc = svc;
  globals.childTestRegister = (fn: typeof handler) => { handler = fn; };
  globals.childTestSession = () => { if (failSession) throw new Error('simulated session failure'); return Promise.resolve({ access_token: 'test-only' }); };
  try {
    const transformed = source
      .replace("import { admin, corsHeaders, issueSession, json, SERVICE_KEY } from '../_shared/accounts.ts';", `
        const admin = () => globalThis.childTestSvc;
        const issueSession = () => globalThis.childTestSession();
        const corsHeaders = {}; const SERVICE_KEY = 'test-only';
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
      `)
      .replace("import { clientKey, kyivDate, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';", `
        const kyivDate = () => '2026-10-29'; const clientKey = () => 'test';
        const peek = () => ({}); const recordFailure = () => ({}); const resetFailures = () => {}; const sleep = async () => {};
      `).replace('Deno.serve(', 'globalThis.childTestRegister(');
    await import(`data:application/typescript,${encodeURIComponent(transformed)}`);
    const id = '11111111-1111-4111-8111-111111111111';
    const send = (ticket?: string) => handler(new Request('http://localhost/claim', { method: 'POST', body: JSON.stringify({ action: 'claim', childId: id, ticket }) }));
    assertEquals((await send()).status, 403);
    assertEquals(updates, 0);
    shifts = [{ id: 'shift', start_date: '2026-10-26', end_date: '2026-10-30' }];
    assertEquals((await send()).status, 401);
    const exp = Date.now() + 60_000;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-only'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`child-claim:${id}:${exp}`)));
    const ticket = `${exp}.${[...signature].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    failSession = true;
    assertEquals((await send(ticket)).status, 500);
    assertEquals(updates, 0);
    failSession = false;
    assertEquals((await send(ticket)).status, 200);
    assertEquals(updates, 1);
  } finally {
    delete globals.childTestSvc; delete globals.childTestRegister; delete globals.childTestSession;
  }
});