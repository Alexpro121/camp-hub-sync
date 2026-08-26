import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Child } from '@/types/app';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Coins, ChevronRight, Lock, CircleDot, ArrowUpDown, MessageSquare, Hash } from 'lucide-react';
import ChildEditDialog from './ChildEditDialog';
import { InlineLoader } from '@/components/ui/loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  myTeam: number;
  /** Controlled accordion state (used by the onboarding tour). */
  openTeam?: number | null;
  onOpenTeamChange?: (team: number | null) => void;
  /** Controlled child editor (used by the onboarding tour). */
  editChild?: Child | null;
  onEditChildChange?: (child: Child | null) => void;
  /** Reports the first child of the supervisor's own team (tour demo target). */
  onFirstTeamChild?: (child: Child | null) => void;
}

type SortMode = 'default' | 'iron_desc' | 'iron_asc' | 'has_notes' | 'present_first';

const SORT_LABELS: Record<SortMode, string> = {
  default: 'За номером',
  iron_desc: 'Айрон ↓ (більше)',
  iron_asc: 'Айрон ↑ (менше)',
  has_notes: 'Спочатку з нотатками',
  present_first: 'Спочатку присутні',
};

const TeamsView = ({
  myTeam,
  openTeam: openTeamProp,
  onOpenTeamChange,
  editChild: editChildProp,
  onEditChildChange,
  onFirstTeamChild,
}: Props) => {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTeamLocal, setOpenTeamLocal] = useState<number | null>(myTeam);
  const [editChildLocal, setEditChildLocal] = useState<Child | null>(null);
  const openTeam = openTeamProp !== undefined ? openTeamProp : openTeamLocal;
  const setOpenTeam = (v: number | null) => {
    setOpenTeamLocal(v);
    onOpenTeamChange?.(v);
  };
  const editChild = editChildProp !== undefined ? editChildProp : editChildLocal;
  const setEditChild = (v: Child | null) => {
    setEditChildLocal(v);
    onEditChildChange?.(v);
  };
  const haptics = useHaptics();
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    (localStorage.getItem('helpsuprov:team-sort') as SortMode) || 'default'
  );

  useEffect(() => {
    localStorage.setItem('helpsuprov:team-sort', sortMode);
  }, [sortMode]);

  // Миттєвий старт із локального снепшота (Zero-Wait UI).
  useEffect(() => {
    const snap = outbox.getTeamsSnapshot<Child[]>();
    if (snap?.data?.length) {
      setChildren(snap.data);
      setLoading(false);
      setFromSnapshot(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // Якщо мережа мовчить довше 1.5 с — не тримаємо користувача на спінері.
    const slowTimer = setTimeout(() => {
      if (!mounted) return;
      const snap = outbox.getTeamsSnapshot<Child[]>();
      if (snap?.data?.length) { setChildren(snap.data); setFromSnapshot(true); }
      setLoading(false);
    }, 1500);

    const load = async () => {
      // Load all shifts and pick the truly active one based on real date
      const { data: shifts } = await supabase
        .from('shifts')
        .select('*')
        .order('start_date', { ascending: false });
      const { pickActiveShift } = await import('@/lib/shift');
      const active = pickActiveShift((shifts || []) as any);
      const activeShiftId = active?.id ?? null;

      let query = supabase.from('children').select('*').order('team_number').order('row_number');
      if (activeShiftId) {
        query = query.eq('shift_id', activeShiftId);
      }
      const { data } = await query;
      if (!data) return;

      // Frontend dedup as safety net
      const seen = new Set<string>();
      const unique = (data || []).filter((c: any) => {
        const key = `${c.shift_id ?? ''}|${c.team_number}|${(c.full_name || '').toLowerCase().trim()}|${c.phone || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      outbox.saveTeamsSnapshot(unique);
      if (mounted) { setChildren(unique as Child[]); setLoading(false); setFromSnapshot(false); }
    };
    load().catch(() => { if (mounted) setLoading(false); });

    const channel = supabase
      .channel('children-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, () => load())
      .subscribe();
    return () => { mounted = false; clearTimeout(slowTimer); supabase.removeChannel(channel); };
  }, []);

  /** Присутність: 0 мс у UI, мережа — фоном через Outbox. */
  const togglePresent = (c: Child) => {
    if (c.team_number !== myTeam) return;
    const next = !c.is_present;
    haptics.selection();
    setChildren((prev) => {
      const updated = prev.map((x) => (x.id === c.id ? { ...x, is_present: next } : x));
      outbox.saveTeamsSnapshot(updated);
      return updated;
    });
    outbox.enqueue('PRESENCE', c.id, { isPresent: next });
  };


  const teams = Array.from(new Set(children.map((c) => c.team_number))).sort((a, b) => a - b);

  useEffect(() => {
    if (!onFirstTeamChild) return;
    const mine = children
      .filter((c) => c.team_number === myTeam)
      .sort((a, b) => (a.row_number ?? 0) - (b.row_number ?? 0));
    onFirstTeamChild(mine[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, myTeam]);

  const sortKids = (kids: Child[]): Child[] => {
    const arr = [...kids];
    const hasNote = (c: Child) => Boolean((c.supervisor_notes && c.supervisor_notes.trim()) || (c.note_from_table && c.note_from_table.trim()));
    switch (sortMode) {
      case 'iron_desc':
        return arr.sort((a, b) => b.iron_dollars - a.iron_dollars || (a.row_number ?? 0) - (b.row_number ?? 0));
      case 'iron_asc':
        return arr.sort((a, b) => a.iron_dollars - b.iron_dollars || (a.row_number ?? 0) - (b.row_number ?? 0));
      case 'has_notes':
        return arr.sort((a, b) => Number(hasNote(b)) - Number(hasNote(a)) || (a.row_number ?? 0) - (b.row_number ?? 0));
      case 'present_first':
        return arr.sort((a, b) => Number(b.is_present) - Number(a.is_present) || (a.row_number ?? 0) - (b.row_number ?? 0));
      default:
        return arr.sort((a, b) => (a.row_number ?? 0) - (b.row_number ?? 0) || a.full_name.localeCompare(b.full_name));
    }
  };

  if (loading) {
    return <InlineLoader label="Завантаження команд" />;
  }

  if (teams.length === 0) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <p className="text-muted-foreground">База порожня. Адміністратор має завантажити таблицю.</p>
      </Card>
    );
  }

  return (
    <>
      {/* Sort selector */}
      <div data-tour="step-1-sort" className="flex items-center gap-2 mb-3 px-1">
        <ArrowUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-11 text-sm flex-1 bg-surface-1 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
              <SelectItem key={k} value={k} className="text-sm py-2.5">{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      <div className="space-y-2 stagger">
        {teams.map((tn) => {
          const teamKidsRaw = children.filter((c) => c.team_number === tn);
          const teamKids = sortKids(teamKidsRaw);
          const isMine = tn === myTeam;
          const loggedIn = teamKidsRaw.filter(c => c.has_logged_in).length;
          const present = teamKidsRaw.filter(c => c.is_present).length;

          return (
            <div key={tn}>
              <Card
                data-tour={isMine ? 'step-2-my-team' : undefined}
                onClick={() => setOpenTeam(openTeam === tn ? null : tn)}
                className={`p-4 cursor-pointer transition-smooth active:scale-[0.99] ${isMine ? 'bg-gradient-card border-primary/40' : 'bg-card/50 border-border/50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${isMine ? 'bg-gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                    {tn}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">Команда {tn}</h3>
                      {isMine && <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">МОЯ</Badge>}
                      {!isMine && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {teamKids.length} дітей · {present} присутні · {loggedIn} увійшли
                    </p>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-muted-foreground transition-smooth ${openTeam === tn ? 'rotate-90' : ''}`} />
                </div>
              </Card>

              <div className="accordion-grid" data-open={openTeam === tn ? 'true' : 'false'}>
                <div className="min-h-0">
                <div className="mt-2 space-y-1.5 pl-2">

                  {teamKids.map((c, ci) => (
                    <Card
                      key={c.id}
                      data-tour={isMine && ci === 0 ? 'step-4-child-card' : undefined}
                      className={`p-3.5 min-h-[60px] flex items-center gap-3 ${isMine ? 'cursor-pointer hover:border-primary/40' : 'opacity-75'} transition-smooth bg-surface-1 border-border/40`}
                      onClick={() => isMine && setEditChild(c)}
                    >
                      {isMine ? (
                        <button
                          type="button"
                          data-tour={ci === 0 ? 'step-3-presence-toggle' : undefined}
                          onClick={(e) => { e.stopPropagation(); togglePresent(c); }}
                          className="p-1 -m-1 touch-manipulation select-none"
                          aria-label={c.is_present ? 'Позначити відсутнім' : 'Позначити присутнім'}
                        >
                          <Checkbox
                            checked={c.is_present}
                            className={`h-6 w-6 rounded-md pointer-events-none ${c.is_present ? 'bg-success border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground shadow-[0_0_12px_hsl(142_71%_45%/0.5)]' : ''}`}
                          />
                        </button>
                      ) : (
                        <div className={`h-6 w-6 rounded-md border-2 ${c.is_present ? 'bg-success border-success' : 'border-border'}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{c.full_name}</p>
                          {c.has_logged_in && (
                            <CircleDot className="w-3 h-3 text-success shrink-0 animate-pulse-glow rounded-full" />
                          )}
                          {((c.supervisor_notes && c.supervisor_notes.trim()) || (c.note_from_table && c.note_from_table.trim())) && (
                            <MessageSquare className="w-3 h-3 text-primary shrink-0" aria-label="Є нотатки" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.team_name ? `Категорія: ${c.team_name} · ` : ''}{c.phone || 'без телефону'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-primary shrink-0">
                        <Coins className="w-3.5 h-3.5" />
                        <span className="text-sm font-bold tabular-nums">{c.iron_dollars}</span>
                      </div>
                    </Card>
                  ))}
                </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {editChild && (
        <ChildEditDialog
          child={editChild}
          open={!!editChild}
          onClose={() => setEditChild(null)}
        />
      )}
    </>
  );
};

export default TeamsView;
