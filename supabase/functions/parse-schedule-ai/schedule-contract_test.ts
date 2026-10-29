import { assertEquals } from 'jsr:@std/assert';

Deno.test('schedule parsing requires admin and validates model times and teams', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  let handler: (request: Request) => Promise<Response> = async () => new Response();
  let isAdmin = false;
  let modelCalls = 0;
  let item = { title: 'Гра', time_start: '10:00', target_teams: [1], sub_slots: [] as { time: string; teams: number[] }[] };
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } } }) },
    from() {
      const query = { select() { return query; }, eq() { return query; }, limit() { return Promise.resolve({ data: isAdmin ? [{ role: 'admin' }] : [], error: null }); } };
      return query;
    },
  };
  const globals = globalThis as typeof globalThis & { scheduleTestClient?: unknown; scheduleTestRegister?: unknown; scheduleTestModel?: unknown };
  globals.scheduleTestClient = client;
  globals.scheduleTestRegister = (callback: typeof handler) => { handler = callback; };
  globals.scheduleTestModel = () => {
    modelCalls++;
    return Promise.resolve({ data: { choices: [{ message: { content: JSON.stringify({ events: [item] }) } }] }, keyUsedIndex: 0 });
  };
  try {
    const transformed = source
      .replace("import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';", 'const createClient = () => globalThis.scheduleTestClient;')
      .replace("import { corsHeaders, json, SUPABASE_URL, ANON_KEY } from '../_shared/accounts.ts';", `const corsHeaders = {}; const SUPABASE_URL = 'http://localhost'; const ANON_KEY = 'test-anon'; const json = (body, status = 200) => new Response(JSON.stringify(body), { status });`)
      .replace("import { fetchGroqWithFallback, hasGroqKeys } from '../_shared/groq-pool.ts';", 'const hasGroqKeys = () => true; const fetchGroqWithFallback = () => globalThis.scheduleTestModel();')
      .replace('Deno.serve(', 'globalThis.scheduleTestRegister(');
    await import(`data:application/typescript,${encodeURIComponent(transformed)}`);
    const send = () => handler(new Request('http://localhost/parse', { method: 'POST', headers: { Authorization: 'Bearer test-user' }, body: JSON.stringify({ rawText: '10:00 Гра' }) }));
    assertEquals((await send()).status, 403);
    assertEquals(modelCalls, 0);
    isAdmin = true;
    assertEquals((await (await send()).json()).source, 'ai');
    item = { ...item, time_start: '99:99' };
    assertEquals((await (await send()).json()).reason, 'schema_mismatch');
    item = { ...item, time_start: '10:00', target_teams: [1.5] };
    assertEquals((await (await send()).json()).reason, 'schema_mismatch');
    item = { ...item, target_teams: [1], sub_slots: [{ time: '25:00', teams: [1] }] };
    assertEquals((await (await send()).json()).reason, 'schema_mismatch');
  } finally {
    delete globals.scheduleTestClient; delete globals.scheduleTestRegister; delete globals.scheduleTestModel;
  }
});