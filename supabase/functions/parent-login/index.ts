import { admin, corsHeaders, issueSession, json, requireUser } from '../_shared/accounts.ts';
import { clientKey, kyivDate, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

/** Вхід для батьків: ПІБ дитини + номер телефону, записаний у списку. */
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().trim().replace(/ё/g, 'е')
    .replace(/[`ʼ'\u2018\u2019\u02BC]/g, "'")
    .replace(/[ьъ](?=[яюєїе])/g, "'")
    .replace(/\s+/g, ' ');
}
const sortedTokens = (s: string) => normalizeName(s).split(' ').filter(Boolean).sort().join(' ');
/** Порівнюємо останні 9 цифр: 0671234567 === +380671234567. */
const phoneKey = (s: string | null | undefined) => String(s || '').replace(/\D/g, '').slice(-9);

async function loadInfo(childId: string) {
  const svc = admin();
  const { data: child } = await svc.from('children')
    .select('id, full_name, team_number, team_name, shift_id')
    .eq('id', childId).is('deleted_at', null).maybeSingle();
  if (!child) return null;
  let shift = null;
  let supervisors: { full_name: string }[] = [];
  if (child.shift_id) {
    const { data: s } = await svc.from('shifts').select('name, start_date, end_date').eq('id', child.shift_id).maybeSingle();
    shift = s;
    const { data: asg } = await svc.from('staff_assignments')
      .select('staff_members(full_name, is_active)')
      .eq('shift_id', child.shift_id).eq('team_number', child.team_number);
    supervisors = (asg || [])
      .map((a: any) => a.staff_members)
      .filter((m: any) => m && m.is_active)
      .map((m: any) => ({ full_name: m.full_name }));
  }
  return {
    child: { id: child.id, full_name: child.full_name, team_number: child.team_number, team_name: child.team_name },
    shift,
    supervisors,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));

    // Оновлення даних для вже авторизованих батьків
    if (body?.action === 'info') {
      const { user } = await requireUser(req).catch(() => ({ user: null }));
      const childId = (user as any)?.user_metadata?.child_id || null;
      const svc = admin();
      let id = childId;
      if (!id && user) {
        const { data: r } = await svc.from('user_roles').select('child_id').eq('user_id', (user as any).id).eq('role', 'child').maybeSingle();
        id = r?.child_id ?? null;
      }
      if (!id) return json({ error: 'unauthorized' }, 401);
      const info = await loadInfo(id);
      return info ? json(info) : json({ error: 'child_not_found' }, 404);
    }

    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const phone = phoneKey(body?.phone);
    if (fullName.split(/\s+/).filter(Boolean).length < 2 || fullName.length > 120) return json({ error: 'invalid_name' }, 400);

    const rlKey = clientKey(req, `parent:${sortedTokens(fullName)}`);
    const RL = { slowAfter: 8, blockAfter: 20 };
    const before = peek(rlKey, 60_000, RL);
    if (before.blocked) return json({ error: 'too_many_attempts' }, 429);
    if (before.slowDown) await sleep(1500);

    const svc = admin();
    // Доступ і під час зміни, і ще 14 днів після її завершення.
    const today = kyivDate(-14);
    const { data: shifts } = await svc.from('shifts').select('id, start_date, end_date').is('deleted_at', null);
    const live = (shifts || []).filter((s: any) => s.end_date >= today).map((s: any) => s.id);
    if (!live.length) return json({ error: 'not_found' }, 404);

    const { data: rows, error } = await svc.from('children')
      .select('id, full_name, phone').in('shift_id', live).is('deleted_at', null);
    if (error) return json({ error: 'search_failed' }, 500);

    const target = sortedTokens(fullName);
    const byName = (rows || []).filter((c: any) => sortedTokens(c.full_name) === target);

    // Перевірка під час вводу ПІБ: чи є в дитини номер телефону в списку.
    // Не розкриваємо, чи знайдено дитину: завжди однакова відповідь.
    if (body?.action === 'check') {
      const unique = byName.length === 1 ? byName[0] : null;
      // Не розкриваємо, чи є така дитина в таборі: форма завжди просить телефон.
      void unique;
      return json({ has_phone: true });
    }

    // Вхід лише з номером телефону, що збігається з базою. Без номера — ні.
    if (byName.length === 1 && phoneKey(byName[0].phone).length < 9) {
      recordFailure(rlKey, RL);
      return json({ error: 'phone_missing' }, 200);
    }
    const matches = byName.filter((c: any) => phone.length >= 9 && phoneKey(c.phone) === phone);

    if (matches.length !== 1) {
      const after = recordFailure(rlKey, RL);
      if (after.blocked) return json({ error: 'too_many_attempts' }, 429);
      return json({ error: matches.length > 1 ? 'ambiguous' : 'not_found' }, 404);
    }
    resetFailures(rlKey);
    const childId = matches[0].id;
    const session = await issueSession(`child-${childId}@ironhelp.local`, 'child', { child_id: childId });
    const info = await loadInfo(childId);
    return json({ session, ...info });
  } catch (_e) {
    return json({ error: 'login_failed' }, 500);
  }
});
