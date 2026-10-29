import { useCallback, useEffect, useRef, useState } from 'react';
import type { Child } from '@/types/app';
import { queuedWrite } from '@/lib/offline';

export const profileFields = (child: Child) => ({
  phone: child.phone ?? '',
  telegram_username: child.telegram_username ?? '',
  supervisor_notes: child.supervisor_notes ?? '',
  gender: ['boy', 'girl', 'unknown'].includes(child.gender ?? '') ? child.gender ?? '' : '',
});
type Draft = ReturnType<typeof profileFields>;
type Status = 'saved' | 'dirty' | 'saving' | 'queued' | 'error';

/** Serialize profile writes and only submit fields actually changed in this editor. */
export function useChildProfileDraft(child: Child, open: boolean) {
  const [draft, setDraft] = useState(() => profileFields(child));
  const [status, setStatus] = useState<Status>('saved');
  const [error, setError] = useState('');
  const latest = useRef(draft);
  const saved = useRef(draft);
  const row = useRef(child);
  const version = useRef(child.updated_at);
  const active = useRef(true);
  const flight = useRef<Promise<boolean> | null>(null);
  row.current = child;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const value = profileFields(child);
    latest.current = value;
    saved.current = value;
    version.current = child.updated_at;
    setDraft(value);
    setStatus('saved');
    setError('');
    // Reset only on a new editing session, not on a live row refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id, open]);

  useEffect(() => {
    const incoming = profileFields(child);
    const next = { ...latest.current };
    for (const key of Object.keys(incoming) as (keyof Draft)[]) {
      if (latest.current[key] === saved.current[key]) next[key] = incoming[key];
    }
    latest.current = next;
    saved.current = incoming;
    version.current = child.updated_at;
    setDraft(next);
  }, [child.phone, child.telegram_username, child.supervisor_notes, child.gender, child.updated_at]);

  const edit = useCallback((key: keyof Draft, value: string) => {
    latest.current = { ...latest.current, [key]: value };
    setDraft(latest.current);
    setStatus('dirty');
    setError('');
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) {
      const ok = await flight.current;
      if (!ok) return false;
      return flush();
    }
    const snapshot = { ...latest.current };
    const values: Record<string, string | null> = {};
    for (const key of Object.keys(snapshot) as (keyof Draft)[]) {
      if (snapshot[key] !== saved.current[key]) values[key] = snapshot[key] || null;
    }
    if (!Object.keys(values).length) return true;
    const id = row.current.id;
    setStatus('saving');
    const task = (async () => {
      try {
        const result = await queuedWrite({
          table: 'children', op: 'update', matchId: id,
          clientUpdatedAt: version.current,
          mergeFields: 'supervisor_notes' in values ? ['supervisor_notes'] : undefined,
          label: `Профіль: ${row.current.full_name}`, values,
        });
        if (result.error && !result.queued) throw result.error;
        if (row.current.id === id) {
          for (const key of Object.keys(values) as (keyof Draft)[]) saved.current[key] = snapshot[key];
          if (active.current) {
            const dirty = Object.keys(snapshot).some(key => latest.current[key as keyof Draft] !== saved.current[key as keyof Draft]);
            setStatus(dirty ? 'dirty' : result.queued ? 'queued' : 'saved');
            setError('');
          }
        }
        return true;
      } catch {
        if (active.current && row.current.id === id) {
          setStatus('error');
          setError('Не вдалося зберегти зміни. Спробуйте ще раз.');
        }
        return false;
      }
    })();
    flight.current = task;
    const ok = await task;
    flight.current = null;
    return ok;
  }, []);

  useEffect(() => {
    if (!open || status !== 'dirty') return;
    const timer = setTimeout(() => { void flush(); }, 800);
    return () => clearTimeout(timer);
  }, [draft, open, status, flush]);

  return { draft, edit, flush, status, error };
}