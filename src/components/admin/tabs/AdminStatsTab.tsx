import { lazyRetry } from '@/lib/lazyRetry';
import { useEffect, useState } from 'react';
import { 
  
  
  
  
  
  
  
  
  Loader2, 
  
  
  
  BarChart3, 
  AlertTriangle, 
  Coins, 
  Users, 
  ArrowRightLeft, 
  
  
  
  
  
  ChevronDown, 
  Pencil,
  
  
  
  
  
  Menu
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { Child, Shift } from '@/types/app';
import ChildEditDialog from '@/components/supervisor/ChildEditDialog';

import { shiftStatus } from '@/lib/shift';
import { CATEGORY_LABELS, resolveShiftPhase, teamsOf } from '@/lib/shift-resolver';

import { SHIFT_LABELS } from '@/components/admin/tabs/shared';

/* =========================================================================
   ВКЛАДКА 3: СТАТИСТИКА ЗМІН
========================================================================= */
interface ShiftStats {
  shift: Shift;
  total: number;
  present: number;
  loggedIn: number;
  ironTotal: number;
  teams: number;
  transfers: number;
}

const StatsTab = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShiftStats[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [orphans, setOrphans] = useState<{ total: number; teams: number; iron: number } | null>(null);
  const [editing, setEditing] = useState<Child | null>(null);

  const load = async () => {
    const [{ data: shifts }, { data: kids }, { data: trans }] = await Promise.all([
      supabase.from('shifts').select('*').order('start_date', { ascending: false }),
      supabase.from('children').select('id, shift_id, row_number, team_number, full_name, phone, team_name, note_from_table, is_present, has_logged_in, iron_dollars, telegram_username, supervisor_notes, created_at, updated_at, deleted_at, gender').order('team_number'),
      supabase.from('transfers').select('child_id'),
    ]);

    const transfersByChild = new Map<string, number>();
    (trans || []).forEach((t: any) => {
      transfersByChild.set(t.child_id, (transfersByChild.get(t.child_id) || 0) + 1);
    });

    const stats: ShiftStats[] = (shifts || []).map((s: any) => {
      const inShift = (kids || []).filter((c: any) => c.shift_id === s.id);
      let transfers = 0;
      inShift.forEach((c: any) => { transfers += transfersByChild.get(c.id) || 0; });
      return {
        shift: s as Shift,
        total: inShift.length,
        present: inShift.filter((c: any) => c.is_present).length,
        loggedIn: inShift.filter((c: any) => c.has_logged_in).length,
        ironTotal: inShift.reduce((sum: number, c: any) => sum + (c.iron_dollars || 0), 0),
        teams: new Set(inShift.map((c: any) => c.team_number)).size,
        transfers,
      };
    });

    const orphanKids = (kids || []).filter((c: any) => !c.shift_id);
    setOrphans(orphanKids.length ? {
      total: orphanKids.length,
      teams: new Set(orphanKids.map((c: any) => c.team_number)).size,
      iron: orphanKids.reduce((s: number, c: any) => s + (c.iron_dollars || 0), 0),
    } : null);

    setChildren((kids || []) as unknown as Child[]);
    setRows(stats);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { void load(); }, 300);
    };
    const ch = supabase.channel('stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      void supabase.removeChannel(ch);
    };
  }, []);

  if (loading) {
    return <Card className="p-8 text-center bg-[#0F1523]/80 border-white/10 rounded-2xl"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#FA5A15]" /></Card>;
  }

  if (rows.length === 0 && !orphans) {
    return (
      <Card className="p-8 text-center bg-[#0F1523]/80 border-white/10 rounded-2xl">
        <BarChart3 className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Немає даних для аналізу</p>
      </Card>
    );
  }

  const totalKids = rows.reduce((s, r) => s + r.total, 0) + (orphans?.total || 0);
  const totalIron = rows.reduce((s, r) => s + r.ironTotal, 0) + (orphans?.iron || 0);
  const totalTransfers = rows.reduce((s, r) => s + r.transfers, 0);
  const orphanKids = children.filter((c) => !c.shift_id);

  return (
    <div className="space-y-3">
      {editing && (
        <ChildEditDialog child={editing} open={!!editing} onClose={() => setEditing(null)} />
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatBox icon={<Users className="w-3.5 h-3.5" />} label="Учасників" value={totalKids} />
        <StatBox icon={<Coins className="w-3.5 h-3.5" />} label="А$" value={totalIron} />
        <StatBox icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Трансферів" value={totalTransfers} />
      </div>

      <h3 className="font-bold uppercase text-xs tracking-wider text-slate-400 px-1 pt-2">По змінах</h3>
      {rows.map((r) => (
        <ShiftStatsCard
          key={r.shift.id}
          stats={r}
          kids={children.filter((c) => c.shift_id === r.shift.id)}
          onPickChild={setEditing}
        />
      ))}

      {orphans && (
        <Card className="p-4 bg-[#0F1523]/60 border border-dashed border-white/15 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Поза змінами
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {orphans.total} учасників у {orphans.teams} командах · {orphans.iron} А$. Не прив'язані до конкретної зміни.
          </p>
          <ChildPickList kids={orphanKids} onPick={setEditing} />
        </Card>
      )}
    </div>
  );
};

const ChildPickList = ({ kids, onPick }: { kids: Child[]; onPick: (c: Child) => void }) => {
  if (!kids.length) return null;
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
      {kids.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c)}
          className="w-full flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-left hover:border-[#FA5A15]/40 active:scale-[0.99] transition-all"
        >
          <span className="text-[10px] font-black font-mono tabular-nums w-8 shrink-0 text-slate-400">#{c.team_number}</span>
          <span className="text-xs font-semibold truncate flex-1 text-slate-200">{c.full_name}</span>
          <span className="text-xs font-mono font-bold text-[#FA5A15] shrink-0">{c.iron_dollars} А$</span>
          <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
};

const formatTeams = (teams: number[]): string => {
  if (!teams.length) return '—';
  const sorted = [...teams].sort((a, b) => a - b);
  const parts: string[] = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === p + 1) { p = n; continue; }
    parts.push(s === p ? String(s) : `${s}-${p}`);
    s = n; p = n;
  }
  return parts.join(', ');
};

const StatBox = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card className="p-3 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
    <div className="flex items-center gap-1 text-slate-400">
      {icon}
      <p className="text-[10px] uppercase font-bold tracking-wider">{label}</p>
    </div>
    <p className="text-xl sm:text-2xl font-black text-[#FA5A15] font-mono tabular-nums mt-1">{value}</p>
  </Card>
);

const ShiftStatsCard = ({ stats: r, kids = [], onPickChild }: { stats: ShiftStats; kids?: Child[]; onPickChild?: (c: Child) => void }) => {
  const [showKids, setShowKids] = useState(false);
  const status = shiftStatus(r.shift);
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    finished: { label: 'Завершена', cls: 'bg-white/5 text-slate-400 border-white/10' },
  };
  const presentPct = r.total ? Math.round((r.present / r.total) * 100) : 0;
  const loggedPct = r.total ? Math.round((r.loggedIn / r.total) * 100) : 0;

  return (
    <Card className="p-4 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl space-y-3 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold truncate text-white">{r.shift.name}</p>
            <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
              {statusMeta[status].label}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {SHIFT_LABELS[r.shift.shift_type]} · {r.shift.start_date} → {r.shift.end_date}
          </p>
          <p className="text-[11px] text-[#FA5A15] font-medium mt-0.5">
            {CATEGORY_LABELS[resolveShiftPhase(r.shift).category]} (Команди: {formatTeams(teamsOf(r.shift))}): {r.total} учасників
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Учасників" value={r.total} />
        <MiniStat label="Команд" value={r.teams} />
        <MiniStat label="Присутні" value={`${r.present}`} hint={`${presentPct}%`} />
        <MiniStat label="Увійшли" value={`${r.loggedIn}`} hint={`${loggedPct}%`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Баланс А$" value={`${r.ironTotal} А$`} accent />
        <MiniStat label="Трансферів" value={r.transfers} />
      </div>

      {kids.length > 0 && onPickChild && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowKids((v) => !v)}
            className="w-full h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showKids ? 'rotate-180' : ''}`} />
            {showKids ? 'Сховати список' : `Переглянути учасників (${kids.length})`}
          </button>
          {showKids && (
            <div className="pt-2 animate-slide-up">
              <ChildPickList kids={kids} onPick={onPickChild} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const MiniStat = ({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: boolean }) => (
  <div className="rounded-xl bg-white/[0.03] p-2 border border-white/5">
    <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
    <div className="flex items-baseline gap-1 mt-0.5">
      <p className={`text-base sm:text-lg font-black font-mono tabular-nums leading-none ${accent ? 'text-[#FA5A15]' : 'text-white'}`}>
        {value}
      </p>
      {hint && <span className="text-[9px] text-slate-400 font-mono tabular-nums">{hint}</span>}
    </div>
  </div>
);


export default StatsTab;
