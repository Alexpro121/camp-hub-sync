import { useEffect, useState } from 'react';
import {
  FileSpreadsheet, Coins, AlertCircle, Megaphone, Siren, Sparkles, Utensils, X,
  Clock, ChevronDown, WifiOff, Train, ArrowLeftRight, Bell, Activity, ShoppingBag, Navigation,
  CheckCircle2, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useDynamicIsland,
  type BroadcastColor,
  type IslandPayload,
  type IslandState,
} from '@/context/DynamicIslandContext';
import { getEventCategoryIcon } from '@/lib/eventIcons';

// Базовий преміальний стиль контейнера Dynamic Island
const BASE =
  'island-container bg-[#06080F]/95 text-slate-100 overflow-hidden backdrop-blur-3xl border border-white/10 flex items-center justify-center relative select-none shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85),_0_0_20px_-5px_rgba(255,255,255,0.05),_inset_0_1px_1px_rgba(255,255,255,0.15)]';

const BROADCAST_THEME: Record<BroadcastColor, { border: string; bg: string; badge: string; glow: string; text: string }> = {
  red: {
    border: 'border-rose-500/40',
    bg: 'bg-gradient-to-b from-[#1C0A0E]/95 to-[#0F0507]/95',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    glow: 'shadow-[0_16px_40px_-8px_rgba(244,63,94,0.35)]',
    text: 'text-rose-100',
  },
  green: {
    border: 'border-emerald-500/40',
    bg: 'bg-gradient-to-b from-[#081C12]/95 to-[#040F0A]/95',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    glow: 'shadow-[0_16px_40px_-8px_rgba(16,185,129,0.35)]',
    text: 'text-emerald-100',
  },
  purple: {
    border: 'border-purple-500/40',
    bg: 'bg-gradient-to-b from-[#170A24]/95 to-[#0A0512]/95',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    glow: 'shadow-[0_16px_40px_-8px_rgba(168,85,247,0.35)]',
    text: 'text-purple-100',
  },
  orange: {
    border: 'border-[#FA5A15]/45',
    bg: 'bg-gradient-to-b from-[#1F0D06]/95 to-[#0D0603]/95',
    badge: 'bg-[#FA5A15]/20 text-orange-300 border-[#FA5A15]/35',
    glow: 'shadow-[0_16px_40px_-8px_rgba(250,90,21,0.35)]',
    text: 'text-orange-100',
  },
};

const BADGE_TITLES: Record<BroadcastColor, string> = {
  red: 'ТЕРМІНОВО', 
  green: 'ІНФОРМАЦІЯ', 
  purple: 'ПОДІЯ', 
  orange: 'ХАРЧУВАННЯ',
};

const BroadcastIcon = ({ color }: { color: BroadcastColor }) => {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (color === 'red') return <Siren className={cls} />;
  if (color === 'green') return <Megaphone className={cls} />;
  if (color === 'purple') return <Sparkles className={cls} />;
  return <Utensils className={cls} />;
};

/** Контекстна іконка з інтелектуальним аналізом назви події */
function renderIslandIcon(state: IslandState, payload: IslandPayload) {
  const cls = 'w-4 h-4 shrink-0';
  if (state === 'OFFLINE') return <WifiOff className={`${cls} text-amber-400`} />;
  if (state === 'EXCEL_IMPORT') return <FileSpreadsheet className={`${cls} text-teal-400`} />;
  if (state === 'BROADCAST') return <Megaphone className={`${cls} text-rose-400`} />;
  if (payload.type === 'TRAIN') return <Train className={`${cls} text-sky-400`} />;
  if (payload.type === 'COUPES_SWAP') return <ArrowLeftRight className={`${cls} text-purple-400`} />;

  const text = `${payload.title || ''} ${payload.subtitle || ''} ${payload.eventTitle || ''}`.toLowerCase();

  if (state === 'EVENT_ALERT' || payload.isSchedule) {
    if (/обід|сніданок|вечеря|чай|смаколики|їдальня|харчування/.test(text)) return <Utensils className={`${cls} text-amber-400`} />;
    if (/йога|зарядка|спорт|футбол|турнір|активн/.test(text)) return <Activity className={`${cls} text-emerald-400`} />;
    if (/ярмарок|ярмарка|покупк/.test(text)) return <ShoppingBag className={`${cls} text-[#FA5A15]`} />;
    if (/таланти|концерт|свічка|дискотека|ватра/.test(text)) return <Sparkles className={`${cls} text-purple-400`} />;
    if (/виїзд|буковель|потяг|трансфер|автобус/.test(text)) return <Navigation className={`${cls} text-sky-400`} />;
    const Fallback = getEventCategoryIcon(payload.eventTitle ?? '', payload.category);
    return <Fallback className={`${cls} text-amber-400`} />;
  }

  if (payload.type === 'COINS' || /долар|монет|баланс|оплат|нарахова|списан/.test(text)) {
    return <Coins className={`${cls} text-[#FA5A15]`} />;
  }
  if (state === 'SUCCESS_TOAST') return <CheckCircle2 className={`${cls} text-emerald-400`} />;
  if (state === 'ERROR_TOAST') return <AlertCircle className={`${cls} text-rose-400`} />;
  return <Bell className={`${cls} text-sky-400`} />;
}

const DynamicIsland = () => {
  const { state, payload, expanded, hide, toggleExpanded, pauseAutoHide, resumeAutoHide } = useDynamicIsland();
  const [contentIn, setContentIn] = useState(false);

  // Плавний стаггер: спочатку розкривається форма острова, через 120мс з'являється текст
  useEffect(() => {
    setContentIn(false);
    if (state === 'HIDDEN') return;
    const t = setTimeout(() => setContentIn(true), 120);
    return () => clearTimeout(t);
  }, [state, payload, expanded]);

  // Захист від зависання на екрані
  useEffect(() => {
    if (state === 'HIDDEN') return;
    const maxTimeout = setTimeout(() => hide(), 12500);
    return () => clearTimeout(maxTimeout);
  }, [state, payload, expanded, hide]);

  // Геометрія та неонові тіні для різних станів острова
  const shape = (() => {
    switch (state) {
      case 'LOADING_ONLY':
        return 'w-[124px] h-[30px] rounded-full border-sky-500/40 shadow-[0_8px_25px_rgba(14,165,233,0.3)]';
      case 'EXCEL_IMPORT':
        return 'w-[336px] max-w-[92vw] h-[78px] rounded-[26px] border-teal-500/40 shadow-[0_12px_32px_rgba(20,184,166,0.25)]';
      case 'OFFLINE':
        return 'w-[268px] max-w-[92vw] h-[40px] rounded-full border-amber-500/40 bg-amber-950/90 text-amber-200 shadow-[0_10px_28px_rgba(245,158,11,0.25)]';
      case 'SUCCESS_TOAST':
        return 'w-[328px] max-w-[92vw] h-[70px] rounded-[24px] border-emerald-500/40 shadow-[0_12px_32px_rgba(16,185,129,0.3)]';
      case 'ERROR_TOAST':
        return 'w-[328px] max-w-[92vw] h-[70px] rounded-[24px] border-rose-500/40 shadow-[0_12px_32px_rgba(244,63,94,0.3)]';
      case 'BROADCAST': {
        const theme = BROADCAST_THEME[payload.color ?? 'red'];
        return `w-[356px] max-w-[92vw] min-h-[98px] rounded-[28px] ${theme.border} ${theme.bg} ${theme.glow}`;
      }
      case 'EVENT_ALERT':
        return expanded
          ? 'w-[364px] max-w-[94vw] min-h-[118px] rounded-[28px] border-amber-500/35 shadow-[0_16px_45px_rgba(245,158,11,0.3)]'
          : 'w-[296px] max-w-[92vw] h-[42px] rounded-full border-amber-500/30 shadow-[0_10px_28px_rgba(245,158,11,0.22)]';
      default:
        return 'w-3 h-3 rounded-full border-transparent opacity-0 scale-0 shadow-none';
    }
  })();

  const color = payload.color ?? 'red';
  const broadcastTheme = BROADCAST_THEME[color];
  const p = payload.progress ?? 0;
  const teamsLabel = payload.myTeams?.length
    ? `(Команд${payload.myTeams.length > 1 ? 'и' : 'а'} ${payload.myTeams.join(' і ')})`
    : '';
  const islandIcon = renderIslandIcon(state, payload);

  return (
    <div className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none safe-top top-2 sm:top-3">
      <div
        onMouseEnter={() => state !== 'HIDDEN' && pauseAutoHide()}
        onMouseLeave={() => state !== 'HIDDEN' && !expanded && resumeAutoHide()}
        onTouchStart={() => state !== 'HIDDEN' && pauseAutoHide()}
        onClick={() => {
          if (state === 'HIDDEN' || state === 'EXCEL_IMPORT' || state === 'LOADING_ONLY') return;
          if (state === 'EVENT_ALERT') toggleExpanded();
          else hide();
        }}
        className={`${BASE} ${shape} transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          state === 'HIDDEN' ? '' : 'opacity-100 scale-100 pointer-events-auto cursor-pointer active:scale-[0.985]'
        }`}
      >
        <div
          className={`w-full h-full flex items-center justify-center px-3.5 transition-all duration-200 ease-out ${
            contentIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {/* 1. СТАН: ЛОАДЕР */}
          {state === 'LOADING_ONLY' && (
            <div className="w-full flex items-center justify-center gap-2">
              <div className="relative w-16 h-1 bg-white/15 rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-sky-400 to-indigo-400 animate-[shimmerMove_1.2s_infinite]" />
              </div>
            </div>
          )}

          {/* 2. СТАН: ІМПОРТ EXCEL ТАБЛИЦІ */}
          {state === 'EXCEL_IMPORT' && (
            <div className="w-full flex flex-col justify-between h-full py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-teal-500/20 border border-teal-500/30 rounded-lg flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white leading-tight">Імпорт таблиці</div>
                    <div className="text-[10px] text-slate-400 truncate">{payload.fileName ?? 'Google Sheets'}</div>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-teal-400 tabular-nums">{p}%</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(20,184,166,0.6)]" 
                  style={{ width: `${p}%` }} 
                />
              </div>
            </div>
          )}

          {/* 3. СТАН: ОФЛАЙН */}
          {state === 'OFFLINE' && (
            <div className="w-full flex items-center justify-between text-xs font-semibold gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="truncate">{payload.queued ? `Офлайн — ${payload.queued} дій у черзі` : 'Офлайн режим'}</span>
              </div>
              <span className="text-[9px] bg-amber-500/25 text-amber-200 px-2 py-0.5 rounded-full border border-amber-500/35 font-mono font-bold shrink-0">
                OFFLINE
              </span>
            </div>
          )}

          {/* 4. СТАН: УСПІШНЕ СПОВІЩЕННЯ (SUCCESS TOAST) */}
          {state === 'SUCCESS_TOAST' && (
            <div className="w-full flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/35 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                  {islandIcon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-emerald-300 leading-tight truncate">{payload.title}</div>
                  {payload.subtitle && (
                    <div className="text-[10px] text-slate-300/80 font-medium leading-tight truncate mt-0.5">
                      {payload.subtitle}
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); hide(); }} 
                className="p-1.5 hover:bg-white/10 active:scale-95 rounded-full transition-colors text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 5. СТАН: ПОМИЛКА (ERROR TOAST) */}
          {state === 'ERROR_TOAST' && (
            <div className="w-full flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/35 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                  {islandIcon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-rose-300 leading-tight truncate">{payload.title}</div>
                  {payload.subtitle && (
                    <div className="text-[10px] text-slate-300/80 font-medium leading-tight truncate mt-0.5">
                      {payload.subtitle}
                    </div>
                  )}
                </div>
              </div>
              {payload.errorDetails ? (
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    toast.error('Деталі помилки', { description: payload.errorDetails }); 
                  }}
                  className="text-[10px] bg-rose-500/25 hover:bg-rose-500/35 active:scale-95 text-rose-200 border border-rose-500/40 px-2.5 py-1 rounded-lg transition-all font-semibold shrink-0"
                >
                  Деталі
                </button>
              ) : (
                <button 
                  onClick={(e) => { e.stopPropagation(); hide(); }} 
                  className="p-1.5 hover:bg-white/10 active:scale-95 rounded-full transition-colors text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* 6. СТАН: ОГОЛОШЕННЯ (BROADCAST) */}
          {state === 'BROADCAST' && (
            <div className="w-full flex flex-col justify-between h-full py-2.5">
              <div className="w-full flex items-center justify-between pb-1.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <BroadcastIcon color={color} />
                  <span className={`text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${broadcastTheme.badge}`}>
                    {BADGE_TITLES[color]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/70 font-medium truncate max-w-[120px]">{payload.author}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); hide(); }} 
                    className="p-1 hover:bg-white/10 active:scale-95 rounded-full transition-colors text-white/70 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={`text-xs font-semibold pt-1.5 leading-relaxed break-words ${broadcastTheme.text}`}>
                {payload.message}
              </div>
            </div>
          )}

          {/* 7. СТАН: НАГАДУВАННЯ ПРО ПОДІЮ (ЗГОРНУТИЙ) */}
          {state === 'EVENT_ALERT' && !expanded && (
            <div className="w-full flex items-center justify-between gap-2.5 text-xs font-semibold">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  {islandIcon}
                </div>
                <span className="text-white truncate">
                  <span className="text-amber-400 font-bold">{payload.phase === 'pre' ? 'Скоро' : 'Зараз'}:</span> {payload.eventTitle}
                  {payload.myTime && (
                    <span className="text-amber-300 font-mono"> ({payload.myTime})</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono text-[11px] font-bold text-amber-300/90 tabular-nums">
                  {payload.range}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-white/60" />
              </div>
            </div>
          )}

          {/* 8. СТАН: ПОДІЯ З ДЕТАЛЯМИ (РОЗГОРНУТИЙ) */}
          {state === 'EVENT_ALERT' && expanded && (
            <div className="w-full h-full flex flex-col justify-between py-3 gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shrink-0 mt-0.5">
                    {islandIcon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold tracking-[0.2em] text-amber-400 uppercase">
                      {payload.phase === 'pre' ? 'Подія за 5 хвилин' : 'Подія починається'}
                    </div>
                    <div className="text-sm font-bold text-white break-words leading-tight mt-0.5">
                      {payload.eventTitle}
                    </div>
                    {payload.subtitle && (
                      <div className="text-[11px] text-amber-200/80 font-medium break-words mt-0.5">
                        {payload.subtitle}
                      </div>
                    )}
                    {payload.location && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-300/80 font-medium mt-1">
                        <MapPin className="w-3 h-3 text-[#FA5A15]" />
                        <span>Локація: {payload.location}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); hide(); }}
                  className="p-1 hover:bg-white/10 active:scale-95 rounded-full transition-colors text-white/60 hover:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {payload.myTime ? (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 font-mono text-xl sm:text-2xl font-black tabular-nums text-amber-300">
                    <Clock className="h-4 w-4 self-center text-amber-400" />
                    <span>Твій вихід: {payload.myTime}</span>
                    {teamsLabel && (
                      <span className="font-sans text-[11px] font-bold text-amber-300/80">{teamsLabel}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    Загальний час події: <span className="font-mono tabular-nums text-slate-200">{payload.range}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 font-mono text-lg font-bold tabular-nums text-white p-2 rounded-xl bg-white/5 border border-white/10">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{payload.range}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmerMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default DynamicIsland;
