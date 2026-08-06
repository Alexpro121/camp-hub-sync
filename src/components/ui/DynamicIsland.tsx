import { useEffect, useState } from 'react';
import {
  FileSpreadsheet, AlertTriangle, Coins, AlertCircle, Megaphone, Siren, Sparkles, Utensils, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDynamicIsland, type BroadcastColor } from '@/context/DynamicIslandContext';

const BASE =
  'island-container bg-black/95 text-white overflow-hidden backdrop-blur-2xl border flex items-center justify-center relative';

const BROADCAST_THEME: Record<BroadcastColor, string> = {
  red: 'border-red-500/50 bg-red-950/95 text-red-100 shadow-[0_12px_35px_rgba(239,68,68,0.3)]',
  green: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100 shadow-[0_12px_35px_rgba(34,197,94,0.3)]',
  purple: 'border-purple-500/50 bg-purple-950/95 text-purple-100 shadow-[0_12px_35px_rgba(168,85,247,0.3)]',
  orange: 'border-amber-500/50 bg-amber-950/95 text-amber-100 shadow-[0_12px_35px_rgba(245,158,11,0.3)]',
};

const BADGE_TITLES: Record<BroadcastColor, string> = {
  red: 'ТЕРМІНОВО', green: 'ІНФОРМАЦІЯ', purple: 'ПОДІЯ', orange: 'ХАРЧУВАННЯ',
};

const BroadcastIcon = ({ color }: { color: BroadcastColor }) => {
  const cls = 'w-4 h-4 shrink-0';
  if (color === 'red') return <Siren className={cls} />;
  if (color === 'green') return <Megaphone className={cls} />;
  if (color === 'purple') return <Sparkles className={cls} />;
  return <Utensils className={cls} />;
};

const DynamicIsland = () => {
  const { state, payload, hide } = useDynamicIsland();
  const [contentIn, setContentIn] = useState(false);

  // Stagger: geometry expands first, content fades in after ~140ms
  useEffect(() => {
    setContentIn(false);
    if (state === 'HIDDEN') return;
    const t = setTimeout(() => setContentIn(true), 140);
    return () => clearTimeout(t);
  }, [state, payload]);

  const shape = (() => {
    switch (state) {
      case 'LOADING_ONLY':
        return 'w-[130px] h-[28px] rounded-full border-blue-500/30 shadow-[0_10px_25px_rgba(0,113,226,0.25)]';
      case 'EXCEL_IMPORT':
        return 'w-[330px] max-w-[92vw] h-[76px] rounded-[26px] border-teal-500/40 shadow-[0_12px_30px_rgba(20,184,166,0.2)]';
      case 'OFFLINE':
        return 'w-[260px] max-w-[92vw] h-[38px] rounded-full border-amber-500/40 bg-amber-950/90 text-amber-200 shadow-[0_10px_25px_rgba(245,158,11,0.2)]';
      case 'SUCCESS_TOAST':
        return 'w-[320px] max-w-[92vw] h-[68px] rounded-[24px] border-emerald-500/40 shadow-[0_12px_30px_rgba(16,185,129,0.25)]';
      case 'ERROR_TOAST':
        return 'w-[320px] max-w-[92vw] h-[68px] rounded-[24px] border-rose-500/40 shadow-[0_12px_30px_rgba(244,63,94,0.25)]';
      case 'BROADCAST':
        return `w-[350px] max-w-[92vw] min-h-[96px] rounded-[28px] ${BROADCAST_THEME[payload.color ?? 'red']}`;
      default:
        return 'w-3.5 h-3.5 rounded-full border-transparent opacity-0 scale-0 shadow-none';
    }
  })();

  const color = payload.color ?? 'red';
  const p = payload.progress ?? 0;

  return (
    <div className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none safe-top top-0">
      <div
        onClick={() => state !== 'HIDDEN' && state !== 'EXCEL_IMPORT' && state !== 'LOADING_ONLY' && hide()}
        className={`${BASE} ${shape} ${state === 'HIDDEN' ? '' : 'opacity-100 scale-100 pointer-events-auto cursor-pointer'}`}
      >
        <div
          className={`content-layer w-full h-full flex items-center justify-center px-3.5 ${
            contentIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {state === 'LOADING_ONLY' && (
            <div className="w-full flex items-center justify-center"><div className="loader" /></div>
          )}

          {state === 'EXCEL_IMPORT' && (
            <div className="w-full flex flex-col justify-between h-full py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1 bg-teal-500/20 border border-teal-500/30 rounded-lg">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white leading-none">Імпорт таблиці</div>
                    <div className="text-[10px] text-slate-400 truncate">{payload.fileName ?? 'Google Sheets'}</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-teal-400">{p}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-200" style={{ width: `${p}%` }} />
              </div>
            </div>
          )}

          {state === 'OFFLINE' && (
            <div className="w-full flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{payload.queued ? `Офлайн — ${payload.queued} дій у черзі` : 'Офлайн'}</span>
              </div>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30 font-mono">OFFLINE</span>
            </div>
          )}

          {state === 'SUCCESS_TOAST' && (
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Coins className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-emerald-300 truncate">{payload.title}</div>
                  {payload.subtitle && <div className="text-[10px] text-slate-400 truncate">{payload.subtitle}</div>}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); hide(); }} className="p-1 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {state === 'ERROR_TOAST' && (
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-rose-300 truncate">{payload.title}</div>
                  {payload.subtitle && <div className="text-[10px] text-slate-400 truncate">{payload.subtitle}</div>}
                </div>
              </div>
              {payload.errorDetails ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toast.error('Деталі помилки', { description: payload.errorDetails }); }}
                  className="text-[10px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 px-2 py-0.5 rounded-lg transition font-medium shrink-0"
                >
                  Деталі
                </button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); hide(); }} className="p-1 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {state === 'BROADCAST' && (
            <div className="w-full flex flex-col justify-between h-full py-2">
              <div className="w-full flex items-center justify-between pb-1 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <BroadcastIcon color={color} />
                  <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full border bg-white/10 border-white/20">
                    {BADGE_TITLES[color]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/60 truncate max-w-[120px]">{payload.author}</span>
                  <button onClick={(e) => { e.stopPropagation(); hide(); }} className="p-1 hover:bg-white/10 rounded-full transition text-white/70 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs font-medium pt-1.5 leading-relaxed text-white/95 break-words">
                {payload.message}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DynamicIsland;