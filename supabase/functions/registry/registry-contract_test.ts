import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';

Deno.test('simultaneous registry note edits preserve both contributions', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  let handler: (request: Request) => Promise<Response> = async () => new Response();
  let row = { id: 'child', supervisor_notes: '', updated_at: 'v1' };
  let initialReads = 0;
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const svc = {
    from(table: string) {
      let patch: Record<string, unknown> | undefined;
      let version: unknown;
      let single = false;
      const query = {
        select() { return query; },
        in() { return query; },
        is() { return query; },
        eq(key: string, value: unknown) { if (key === 'updated_at') version = value; return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        maybeSingle() { single = true; return query; },
        async then(resolve: (value: unknown) => unknown) {
          if (table === 'shifts') return resolve({ data: [{ id: 'shift', name: 'Shift' }], error: null });
          if (patch) {
            if (version !== row.updated_at) return resolve({ data: null, error: null });
            row = { ...row, ...patch, updated_at: row.updated_at === 'v1' ? 'v2' : 'v3' };
            return resolve({ data: { ...row }, error: null });
          }
          if (single) return resolve({ data: { ...row }, error: null });
          const snapshot = { ...row };
          initialReads++;
          if (initialReads === 2) release();
          await barrier;
          return resolve({ data: [snapshot], error: null });
        },
      };
      return query;
    },
  };
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-only'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const exp = Date.now() + 60_000;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`registry:${exp}`)));
  const token = `${exp}.${[...sig].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const globals = globalThis as typeof globalThis & { registryTestSvc?: unknown; registryTestRegister?: unknown };
  globals.registryTestSvc = svc;
  globals.registryTestRegister = (fn: typeof handler) => { handler = fn; };
  try {
    const transformed = source.replace("import { admin, corsHeaders, json, SERVICE_KEY } from '../_shared/accounts.ts';", `
      const admin = () => globalThis.registryTestSvc;
      const corsHeaders = {};
      const SERVICE_KEY = 'test-only';
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    `).replace('Deno.serve(', 'globalThis.registryTestRegister(');
    await import(`data:application/typescript,${encodeURIComponent(transformed)}`);
    const send = (note: string) => handler(new Request('http://localhost/registry', { method: 'POST', body: JSON.stringify({ action: 'batch', token, items: [{ id: 'child', supervisor_notes: note, base_note: '' }] }) }));
    const responses = await Promise.all([send('Ліки передані'), send('Алергія')]);
    for (const response of responses) assertEquals((await response.json()).results[0].status, 'ok');
    assertStringIncludes(row.supervisor_notes, 'Ліки передані');
    assertStringIncludes(row.supervisor_notes, 'Алергія');
  } finally {
    delete globals.registryTestSvc;
    delete globals.registryTestRegister;
  }
});