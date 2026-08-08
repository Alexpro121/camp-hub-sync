import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Child, Shift } from '@/types/app';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Search, Loader2, Repeat, ArrowRightLeft, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeName } from '@/lib/normalize';
import { pickActiveShift } from '@/lib/shift';
import { InlineLoader } from '@/components/ui/loader';
import { pushIsland } from '@/lib/islandBus';

interface Props { myTeam: number; }

type Mode = 'transfer' | 'swap';

const TransfersView = ({ myTeam }: Props) => {
  const [children, setChildren] = useState<Child[]>([]);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('transfer');

  // Transfer state
  const [selected, setSelected] = useState<Child | null>(null);
  const [targetTeam, setTargetTeam] = useState<string>('');
  const [allowCustomTeam, setAllowCustomTeam] = useState(false);
  const [customTeam, setCustomTeam] = useState('');

  // Swap state
  const [swapA, setSwapA] = useState<Child | null>(null);
  const [swapQuery, setSwapQuery] = useState('');
  const [swapB, setSwapB] = useState<{ id: string; full_name: string; team_number: number } | null>(null);
  const [swapMatches, setSwapMatches] = useState<{ id: string; full_name: string; team_number: number }[]>([]);
  const [availableTeams, setAvailableTeams] = useState<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: shifts } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
      const active = pickActiveShift((shifts || []) as Shift[]);
      setShiftId(active?.id ?? null);

      let q = supabase.from('children').select('*').order('team_number').order('full_name');
      if (active?.id) q = q.eq('shift_id', active.id);
      const { data } = await q;
      setChildren((data || []) as Child[]);

      const { data: teams } = await supabase.rpc('get_available_transfer_teams', {
        p_shift_id: active?.id ?? null,
        p_my_team: myTeam,
      });
      setAvailableTeams(((teams || []) as { team_number: number }[]).map((t) => t.team_number));
      setInitialLoading(false);
    };
    load();
    const ch = supabase.channel('transfers-children')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myTeam]);

  const myKids = useMemo(() => children.filter((c) => c.team_number === myTeam), [children, myTeam]);
  const otherTeams = availableTeams;
  const existingTeams = useMemo(
    () => Array.from(new Set([...children.map((c) => c.team_number), ...availableTeams])).sort((a, b) => a - b),
    [children, availableTeams],
  );

  // Server-side search for swap partner (other teams)
  useEffect(() => {
    const q = swapQuery.trim();
    if (q.length < 2) { setSwapMatches([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_child_for_transfer', {
        p_query: q,
        p_shift_id: shiftId,
        p_my_team: myTeam,
      });
      if (cancelled) return;
      if (error) { setSwapMatches([]); return; }
      setSwapMatches((data || []) as { id: string; full_name: string; team_number: number }[]);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [swapQuery, shiftId, myTeam]);

  /* ---- TRANSFER ---- */
  const performTransfer = async () => {
    if (!selected) { toast.error('Обери дитину'); return; }
    const tn = allowCustomTeam ? parseInt(customTeam, 10) : parseInt(targetTeam, 10);
    if (!tn) { toast.error('Обери команду'); return; }
    if (tn === selected.team_number) { toast.error('Та сама команда'); return; }
    if (!allowCustomTeam && !existingTeams.includes(tn)) {
      toast.error('Команда не існує'); return;
    }
    setLoading(true);
    const fromTeam = selected.team_number;
    const { error } = await supabase.rpc('execute_child_transfer', {
      p_child_id: selected.id,
      p_target_team: tn,
      p_performed_by: `Команда #${myTeam}`,
    });
    if (error) { toast.error('Помилка переведення'); setLoading(false); return; }
    toast.success('Переведено');
    pushIsland(`${selected.full_name}: #${fromTeam} → #${tn}`, 'success', 'Переведення');
    setSelected(null); setTargetTeam(''); setCustomTeam(''); setAllowCustomTeam(false);
    setLoading(false);
  };

  /* ---- SWAP ---- */
  const performSwap = async () => {
    if (!swapA || !swapB) { toast.error('Обери обох дітей'); return; }
    if (swapA.team_number === swapB.team_number) { toast.error('Та сама команда'); return; }
    setLoading(true);
    const teamA = swapA.team_number, teamB = swapB.team_number;
    const { error } = await supabase.rpc('execute_child_swap', {
      p_child_1_id: swapA.id,
      p_child_2_id: swapB.id,
      p_performed_by: `Заміна · #${myTeam}`,
    });
    if (error) { toast.error('Помилка заміни'); setLoading(false); return; }
    toast.success('Заміна виконана');
    pushIsland(`${swapA.full_name} (#${teamA}) ⇄ ${swapB.full_name} (#${teamB})`, 'success', 'Заміна');
    setSwapA(null); setSwapB(null); setSwapQuery(''); setSwapMatches([]);
    setLoading(false);
  };

  if (initialLoading) {
    return <InlineLoader label="Завантаження даних" />;
  }

  return (
    <div className="space-y-4">
      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-1 border border-border/40">
        <button
          onClick={() => setMode('transfer')}
          className={`h-10 rounded-lg font-bold text-xs uppercase tracking-wide transition-smooth flex items-center justify-center gap-1.5 ${mode === 'transfer' ? 'bg-gradient-primary text-primary-foreground shadow-glow' : 'text-muted-foreground'}`}
        >
          <ArrowRight className="w-3.5 h-3.5" /> Переведення
        </button>
        <button
          onClick={() => setMode('swap')}
          className={`h-10 rounded-lg font-bold text-xs uppercase tracking-wide transition-smooth flex items-center justify-center gap-1.5 ${mode === 'swap' ? 'bg-gradient-primary text-primary-foreground shadow-glow' : 'text-muted-foreground'}`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Заміна
        </button>
      </div>

      {mode === 'transfer' && (
        <Card className="p-4 bg-gradient-card space-y-3">
          {/* 1. Select child from MY team */}
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">1. Дитина з моєї команди</p>
            {!selected ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                {myKids.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">У твоїй команді поки нікого</p>
                )}
                {myKids.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="w-full min-h-[52px] p-3 rounded-lg bg-surface-1 hover:bg-surface-2 active:scale-[0.99] text-left transition-smooth border border-border/40"
                  >
                    <p className="font-medium text-sm">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone || 'без телефону'}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-surface-1 border border-primary/30 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{selected.full_name}</p>
                  <p className="text-xs text-muted-foreground">Зараз: команда #{selected.team_number}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setSelected(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* 2. Pick target team */}
          {selected && (
            <div className="space-y-1.5 animate-slide-up">
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">2. Цільова команда</p>
              {!allowCustomTeam ? (
                <Select value={targetTeam} onValueChange={setTargetTeam}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Обери команду..." />
                  </SelectTrigger>
                  <SelectContent>
                    {otherTeams.length === 0 && (
                      <div className="text-xs text-muted-foreground p-3">Інших команд немає</div>
                    )}
                    {otherTeams.map((tn) => (
                      <SelectItem key={tn} value={String(tn)}>Команда #{tn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Введи новий №"
                  value={customTeam}
                  onChange={(e) => setCustomTeam(e.target.value)}
                  className="h-12"
                />
              )}

              <Button
                onClick={performTransfer}
                disabled={loading}
                className="w-full h-12 font-bold uppercase mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowRight className="w-4 h-4 mr-2" /> Перевести</>}
              </Button>
            </div>
          )}
        </Card>
      )}

      {mode === 'swap' && (
        <Card className="p-4 bg-gradient-card space-y-3">
          {/* A: my team */}
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">1. Дитина з моєї команди</p>
            {!swapA ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-thin pr-1">
                {myKids.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSwapA(c)}
                    className="w-full min-h-[52px] p-3 rounded-lg bg-surface-1 hover:bg-surface-2 active:scale-[0.99] text-left transition-smooth border border-border/40"
                  >
                    <p className="font-medium text-sm">{c.full_name}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-surface-1 border border-primary/30 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{swapA.full_name}</p>
                  <p className="text-xs text-muted-foreground">Команда #{swapA.team_number}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setSwapA(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* B: search other teams */}
          {swapA && (
            <div className="space-y-1.5 animate-slide-up">
              <p className="text-[11px] uppercase text-muted-foreground tracking-wider">2. Дитина з іншої команди</p>
              {!swapB ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Пошук за ПІБ..."
                      value={swapQuery}
                      onChange={(e) => setSwapQuery(e.target.value)}
                      className="pl-10 h-12"
                    />
                  </div>
                  {swapMatches.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                      {swapMatches.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSwapB(c)}
                          className="w-full min-h-[52px] p-3 rounded-lg bg-surface-1 hover:bg-surface-2 active:scale-[0.99] text-left transition-smooth border border-border/40"
                        >
                          <p className="font-medium text-sm">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground">Команда #{c.team_number}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3 rounded-lg bg-surface-1 border border-primary/30 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{swapB.full_name}</p>
                    <p className="text-xs text-muted-foreground">Команда #{swapB.team_number}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setSwapB(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {swapA && swapB && (
                <Button
                  onClick={performSwap}
                  disabled={loading}
                  className="w-full h-12 font-bold uppercase mt-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Repeat className="w-4 h-4 mr-2" /> Поміняти місцями</>}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Hidden "create new team" toggle — only visible in transfer mode */}
      {mode === 'transfer' && (
        <div className="flex justify-center">
          <button
            onClick={() => setAllowCustomTeam((v) => !v)}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-smooth flex items-center gap-1 px-2 py-1"
            title="Розблокувати створення нової команди"
          >
            <Plus className="w-2.5 h-2.5" />
            {allowCustomTeam ? 'Сховати' : 'нова команда'}
          </button>
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground">
        Усі дії фіксуються у стрічці новин
      </div>
    </div>
  );
};

export default TransfersView;
