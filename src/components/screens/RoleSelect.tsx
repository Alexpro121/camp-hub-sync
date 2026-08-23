import { useEffect, useState } from 'react';
import { ArrowRight, Coins, ShieldCheck } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import { getTelegramUser } from '@/hooks/useTelegramWebApp';
import { supabase } from '@/integrations/supabase/client';
import { pickActiveShift, shiftStatus } from '@/lib/shift';
import type { Shift } from '@/types/app';
import type { Screen } from '@/pages/Index';

interface Props {
  onSelect: (s: Screen) => void;
}

const RoleSelect = ({ onSelect }: Props) => {
  const haptics = useHaptics();
  const [user] = useState(() => getTelegramUser());
  const [shift, setShift] = useState<Shift | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('shifts').select('*').is('deleted_at', null).order('start_date', { ascending: false });
      if (cancelled) return;
      setShift(pickActiveShift((data || []) as Shift[]));
    })();
    return () => { cancelled = true; };
  }, []);

  const pick = (s: Screen) => { haptics.impact('light'); onSelect(s); };

  const status = shift ? shiftStatus(shift) : null;
  const statusLabel = status === 'active' ? 'Активна' : status === 'upcoming' ? 'Незабаром' : 'Завершена';

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between p-4 safe-top safe-bottom overflow-x-hidden">
      {/* Header */}
      <header className="pt-6 animate-fade-in">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 font-mono">
          {user?.first_name ? `Користувач: ${user.first_name}` : 'Система координації'}
        </p>
        <h1 className="mt-2 text-4xl xs:text-5xl font-black tracking-tighter leading-[0.9] uppercase">
          Залізна<br />
          <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">Зміна</span>
        </h1>
        <p className="mt-2 text-xs tracking-[0.28em] uppercase text-muted-foreground/60 font-mono">Camp Hub</p>

        {shift && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 backdrop-blur-md px-3 py-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-success' : 'bg-muted-foreground/60'}`} />
            <span className="text-xs font-medium text-muted-foreground">
              {shift.name} · {statusLabel}
            </span>
          </div>
        )}
      </header>

      {/* Role cards */}
      <div className="grid gap-3 my-8">
        <button
          type="button"
          onClick={() => pick('child')}
          className="group w-full text-left min-h-[92px] rounded-2xl p-5 bg-card/60 backdrop-blur-xl border border-border/40 hover:border-primary/50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] will-change-transform"
        >
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 shrink-0 rounded-full bg-secondary border border-primary/25 flex items-center justify-center">
              <Coins className="w-6 h-6 text-primary" strokeWidth={1.75} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-bold tracking-tight">Я учасник</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">
                Особистий кабінет, баланс Айрон Доларів та розклад
              </span>
            </span>
            <ArrowRight className="w-5 h-5 text-muted-foreground/60 shrink-0 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.75} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => pick('supervisor')}
          className="group w-full text-left min-h-[92px] rounded-2xl p-5 bg-card/60 backdrop-blur-xl border border-primary/25 hover:border-primary/60 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] will-change-transform"
        >
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 shrink-0 rounded-full bg-primary flex items-center justify-center shadow-glow">
              <ShieldCheck className="w-6 h-6 text-primary-foreground" strokeWidth={1.75} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-bold tracking-tight">Я супровід</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">
                Керування командою, присутність та активності
              </span>
            </span>
            <ArrowRight className="w-5 h-5 text-muted-foreground/60 shrink-0 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.75} />
          </div>
        </button>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between text-[11px] text-muted-foreground/60 font-mono">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Online · Синхронізація активна
        </span>
        <span>v2.0 · Залізна Зміна</span>
      </footer>
    </div>
  );
};

export default RoleSelect;
