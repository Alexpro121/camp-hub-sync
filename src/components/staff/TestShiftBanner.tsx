import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { readCache, writeCache } from '@/lib/lightSync';
import { testClosesLabel, testShiftOpen } from '@/lib/testShift';

type Info = { is_test: boolean; expires_at: string | null };

/** Смуга «Тестова зміна» над панеллю супроводу; для звичайної зміни нічого не показує. */
const TestShiftBanner = ({ shiftId }: { shiftId: string }) => {
  const key = `ironshift:shift-test:${shiftId}`;
  const [info, setInfo] = useState<Info | null>(() => readCache<Info>(key)?.data ?? null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    // deno-lint-ignore no-explicit-any
    (supabase.from('shifts') as any).select('is_test, expires_at').eq('id', shiftId).maybeSingle()
      .then(({ data, error }: { data: Info | null; error: unknown }) => {
        if (!alive || error || !data) return;
        setInfo(data);
        writeCache(key, data);
      });
    return () => { alive = false; };
  }, [shiftId, key]);

  const expiresAt = info?.is_test ? info.expires_at : null;
  const open = testShiftOpen(expiresAt, now);
  useEffect(() => {
    if (!expiresAt || !open) return;
    const left = Date.parse(expiresAt) - Date.now();
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(left, 2_147_483_647)));
    return () => clearTimeout(t);
  }, [expiresAt, open]);

  if (!expiresAt) return null;
  return (
    <div role="status" className="px-4 py-2 text-center text-xs font-bold bg-amber-400 text-amber-950 safe-top">
      <FlaskConical className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
      {open
        ? <>ТЕСТОВА ЗМІНА · закривається {testClosesLabel(expiresAt)} і зникне разом з усіма даними</>
        : <>Тестова зміна закрита · вийди в кабінет</>}
    </div>
  );
};

export default TestShiftBanner;
