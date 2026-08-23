import { useEffect, useMemo, useState } from 'react';
import { Coins, Wallet, Edit2, Check, AlertTriangle, Plus, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { Child } from '@/types/app';
import { pickActiveShift } from '@/lib/shift';

interface Props {
  myTeam: number;
  open: boolean;
  onClose: () => void;
}

const KEY = (team: number) => `helpsuprov:bank:${team}`;

const IronBank = ({ myTeam, open, onClose }: Props) => {
  const [budget, setBudget] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [distributed, setDistributed] = useState(0);

  // Load budget from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(KEY(myTeam));
    if (raw !== null) {
      const n = parseInt(raw, 10);
      setBudget(Number.isFinite(n) ? n : null);
    } else {
      setEditing(true);
    }
  }, [myTeam]);

  // Load distributed = sum of iron_dollars in my team within active shift
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const load = async () => {
      const { data: shifts } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
      const active = pickActiveShift((shifts || []) as any);
      let q = supabase.from('children').select('iron_dollars').eq('team_number', myTeam);
      if (active?.id) q = q.eq('shift_id', active.id);
      const { data } = await q;
      if (!mounted) return;
      const total = (data || []).reduce((s: number, c: any) => s + (c.iron_dollars || 0), 0);
      setDistributed(total);
    };
    load();
    const ch = supabase.channel('bank-children')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [myTeam, open]);

  const remaining = useMemo(() => (budget ?? 0) - distributed, [budget, distributed]);
  const negative = budget !== null && remaining < 0;
  const pct = budget && budget > 0 ? Math.max(0, Math.min(100, (distributed / budget) * 100)) : 0;

  const saveBudget = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 0) return;
    setBudget(n);
    localStorage.setItem(KEY(myTeam), String(n));
    setEditing(false);
    setDraft('');
  };

  const adjust = (delta: number) => {
    const base = budget ?? 0;
    const next = Math.max(0, base + delta);
    setBudget(next);
    localStorage.setItem(KEY(myTeam), String(next));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-gradient-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase">
            <Wallet className="w-5 h-5 text-primary" /> Банк Айрон Доларів
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Команда #{myTeam} · персональний рахунок супроводу
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Budget hero */}
          <Card data-tour="step-5-bank-balance" className={`p-5 border-0 ${negative ? 'bg-destructive/15' : 'bg-gradient-primary'} relative overflow-hidden`}>
            <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-primary-foreground/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs font-bold uppercase tracking-wider ${negative ? 'text-destructive-foreground/80' : 'text-primary-foreground/80'}`}>
                  Залишок
                </p>
                {!editing && (
                  <button
                    onClick={() => { setDraft(String(budget ?? 0)); setEditing(true); }}
                    className={`p-1.5 rounded-lg ${negative ? 'text-destructive-foreground/80 hover:text-destructive-foreground' : 'text-primary-foreground/80 hover:text-primary-foreground'} hover:bg-white/10 transition-smooth`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {editing ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    autoFocus
                    placeholder="Скільки в банку?"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
                    className="h-12 text-2xl font-black bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/40 tabular-nums"
                  />
                  <Button onClick={saveBudget} size="icon" className="h-12 w-12 bg-primary-foreground text-primary hover:bg-primary-foreground/90 shrink-0">
                    <Check className="w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <p className={`text-5xl font-black tabular-nums leading-none ${negative ? 'text-destructive-foreground' : 'text-primary-foreground'}`}>
                    {remaining}
                  </p>
                  <Coins className={`w-7 h-7 mb-1 ${negative ? 'text-destructive-foreground' : 'text-primary-foreground'}`} />
                </div>
              )}

              {!editing && (
                <p className={`text-xs mt-2 ${negative ? 'text-destructive-foreground/80' : 'text-primary-foreground/80'}`}>
                  Видано {distributed} з {budget ?? 0}
                </p>
              )}
            </div>
          </Card>

          {/* Progress bar */}
          {budget !== null && budget > 0 && !editing && (
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${negative ? 'bg-destructive' : 'bg-gradient-primary'}`}
                  style={{ width: `${negative ? 100 : pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>0</span>
                <span>{budget}</span>
              </div>
            </div>
          )}

          {/* Negative warning (informative, not blocking) */}
          {negative && !editing && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive-foreground">
                Баланс у мінусі на <span className="font-bold tabular-nums">{Math.abs(remaining)}</span>. Це інформативно — система не блокує видачу.
              </p>
            </div>
          )}

          {/* Quick adjust */}
          {!editing && budget !== null && (
            <div className="grid grid-cols-4 gap-2">
              {[-10, -1, 1, 10].map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  onClick={() => adjust(d)}
                  className="h-11 font-bold tabular-nums"
                >
                  {d > 0 ? <Plus className="w-3 h-3 mr-0.5" /> : <Minus className="w-3 h-3 mr-0.5" />}
                  {Math.abs(d)}
                </Button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Банк зберігається локально на цьому пристрої. Видача дітям рахується автоматично з балансів команди.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IronBank;
