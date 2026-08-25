import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppNotification } from '@/types/app';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeftRight, 
  Bell, 
  Trash2, 
  AlertTriangle, 
  CircleDot, 
  GraduationCap, 
  Megaphone, 
  Coins, 
  Calendar, 
  CheckCheck,
  UserCheck,
  Filter
} from 'lucide-react';
import {
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent,
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { InlineLoader } from '@/components/ui/loader';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  myTeam: number;
  onRestartTour?: () => void;
}

const SEEN_KEY = (team: number) => `helpsuprov:notif-seen:${team}`;
const CLEARED_KEY = (team: number) => `helpsuprov:notif-cleared:${team}`;

// Форматування часу у зрозумілий український формат
const formatNotifTime = (isoString: string) => {
  try {
    const d = new Date(isoString);
    const now = new Date();
    
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Сьогодні, ${timeStr}`;
    if (isYesterday) return `Вчора, ${timeStr}`;

    const months = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'груд'];
    return `${d.getDate()} ${months[d.getMonth()]}, ${timeStr}`;
  } catch {
    return isoString;
  }
};

// Очищення сирих ISO-таймстемпів із повідомлення
const sanitizeMessage = (msg: string | null) => {
  if (!msg) return '';
  return msg
    .replace(/·\s*\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/gi, '')
    .trim();
};

// Розумний підбір іконки та стилю
const getNotificationVisuals = (notif: AppNotification) => {
  const title = (notif.title || '').toLowerCase();
  const text = `${title} ${notif.message || ''}`.toLowerCase();
  
  if (title.includes('вхід')) {
    return {
      icon: UserCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15 border-emerald-500/30',
      isSystemLog: true
    };
  }
  if (text.includes('трансфер') || text.includes('переведен') || text.includes('купе') || text.includes('потяг')) {
    return {
      icon: ArrowLeftRight,
      color: 'text-sky-400',
      bg: 'bg-sky-500/15 border-sky-500/30',
      isSystemLog: false
    };
  }
  if (text.includes('ярмарок') || text.includes('айрон') || text.includes('а$') || text.includes('баланс') || text.includes('оплат')) {
    return {
      icon: Coins,
      color: 'text-[#FA5A15]',
      bg: 'bg-[#FA5A15]/15 border-[#FA5A15]/30',
      isSystemLog: false
    };
  }
  if (text.includes('розклад') || text.includes('поді') || text.includes('зал') || text.includes('репетиц')) {
    return {
      icon: Calendar,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/15 border-indigo-500/30',
      isSystemLog: false
    };
  }
  if (text.includes('оголошення') || text.includes('штаб') || text.includes('увага') || text.includes('адмін')) {
    return {
      icon: Megaphone,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15 border-amber-500/30',
      isSystemLog: false
    };
  }

  return {
    icon: Bell,
    color: 'text-primary',
    bg: 'bg-primary/15 border-primary/30',
    isSystemLog: false
  };
};

const NotificationsView = ({ myTeam, onRestartTour }: Props) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideSystemLogs, setHideSystemLogs] = useState(false);
  const haptics = useHaptics();

  const [seenBefore, setSeenBefore] = useState<string>(() => {
    return localStorage.getItem(SEEN_KEY(myTeam)) || '1970-01-01T00:00:00.000Z';
  });

  const [clearedBefore, setClearedBefore] = useState<string>(() => {
    return localStorage.getItem(CLEARED_KEY(myTeam)) || '1970-01-01T00:00:00.000Z';
  });

  const emitBadgeSync = useCallback(() => {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('helpsuprov:notif-sync'));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      if (!cancelled) {
        setItems((data || []) as AppNotification[]);
        setLoading(false);
      }
    };

    load();

    const ch = supabase
      .channel('notif-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
        setItems((prev) => [p.new as AppNotification, ...prev].slice(0, 150));
      })
      .subscribe();

    return () => { 
      cancelled = true;
      supabase.removeChannel(ch); 
    };
  }, []);

  // Миттєве позначення як прочитані
  useEffect(() => {
    const now = new Date().toISOString();
    const timer = setTimeout(() => {
      localStorage.setItem(SEEN_KEY(myTeam), now);
      setSeenBefore(now);
      emitBadgeSync();
    }, 600);

    return () => clearTimeout(timer);
  }, [myTeam, emitBadgeSync]);

  const visibleItems = useMemo(() => {
    return items
      .filter((n) => n.created_at > clearedBefore)
      .filter((n) => {
        if (!hideSystemLogs) return true;
        const title = (n.title || '').toLowerCase();
        return !title.includes('вхід');
      });
  }, [items, clearedBefore, hideSystemLogs]);

  const unreadCount = useMemo(
    () => visibleItems.filter((n) => n.created_at > seenBefore).length,
    [visibleItems, seenBefore]
  );

  const markAllRead = () => {
    haptics.impact('light');
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY(myTeam), now);
    setSeenBefore(now);
    emitBadgeSync();
    toast.success('Усі сповіщення позначено як прочитані');
  };

  const clearForMe = () => {
    haptics.notification('success');
    const now = new Date().toISOString();
    localStorage.setItem(CLEARED_KEY(myTeam), now);
    localStorage.setItem(SEEN_KEY(myTeam), now);
    setClearedBefore(now);
    setSeenBefore(now);
    emitBadgeSync();
    toast.success(`Стрічку очищено для команди №${myTeam}`);
  };

  if (loading) {
    return <InlineLoader label="Завантаження сповіщень..." />;
  }

  const tourButton = onRestartTour ? (
    <Button
      variant="outline"
      onClick={() => {
        haptics.impact('light');
        onRestartTour();
      }}
      className="w-full min-h-[44px] rounded-xl text-xs font-bold border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 transition-all active:scale-[0.98]"
    >
      <GraduationCap className="w-4 h-4 mr-2 text-[#FA5A15]" /> 
      <span>Пройти інтерактивне навчання ще раз</span>
    </Button>
  ) : null;

  if (visibleItems.length === 0) {
    return (
      <div data-tour="step-8-notifications-root" className="space-y-3 select-none pb-24">
        {tourButton}
        <Card className="p-8 text-center bg-[#0F1523]/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <Bell className="w-6 h-6 text-slate-500" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100">Стрічка сповіщень порожня</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Нові оголошення штабу та події команди з'являтимуться тут автоматично
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div data-tour="step-8-notifications-root" className="space-y-3 select-none pb-24">
      {tourButton}

      {/* Верхня панель дій */}
      <div className="flex items-center justify-between px-1 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            {visibleItems.length} {visibleItems.length === 1 ? 'сповіщення' : 'сповіщень'}
          </span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#FA5A15]/15 border border-[#FA5A15]/30 text-[10px] font-bold text-[#FA5A15]">
              {unreadCount} нових
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Фільтр системних логів */}
          <button
            onClick={() => {
              haptics.impact('light');
              setHideSystemLogs(!hideSystemLogs);
            }}
            className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
              hideSystemLogs 
                ? 'bg-[#FA5A15]/20 text-[#FA5A15] border border-[#FA5A15]/30' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{hideSystemLogs ? 'Тільки важливі' : 'Всі'}</span>
          </button>

          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={markAllRead}
              className="h-8 px-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              <span>Прочитано</span>
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-2.5 text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>Очистити</span>
              </Button>
            </AlertDialogTrigger>
            
            <AlertDialogContent className="bg-[#0F1523] border border-white/10 rounded-2xl sm:rounded-3xl text-slate-100 max-w-sm mx-auto">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                  <span>Очистити стрічку сповіщень?</span>
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-slate-400 space-y-2 pt-1 leading-relaxed">
                  <span>
                    Будуть приховані всі поточні повідомлення для команди <strong className="text-white">№{myTeam}</strong>.
                  </span>
                  <span className="block text-slate-500 text-[11px]">
                    Нові оголошення штабу з'являтимуться в звичному режимі.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <AlertDialogFooter className="gap-2 sm:gap-0 mt-3">
                <AlertDialogCancel className="bg-white/5 border-white/10 hover:bg-white/10 text-slate-300 rounded-xl text-xs">
                  Скасувати
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={clearForMe} 
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
                >
                  Так, очистити
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Список карток */}
      <div className="space-y-2">
        {visibleItems.map((n) => {
          const isUnread = n.created_at > seenBefore;
          const visuals = getNotificationVisuals(n);
          const IconComponent = visuals.icon;
          const cleanMsg = sanitizeMessage(n.message);

          return (
            <Card
              key={n.id}
              className={`p-3.5 rounded-2xl flex items-start gap-3 transition-all duration-200 backdrop-blur-xl ${
                isUnread
                  ? 'bg-gradient-to-r from-[#0F1523] to-[#161F33] border-[#FA5A15]/40 shadow-[0_0_18px_rgba(250,90,21,0.12)]'
                  : 'bg-[#0F1523]/70 border-white/5 hover:border-white/10'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${visuals.bg}`}>
                <IconComponent className={`w-5 h-5 ${visuals.color}`} strokeWidth={1.9} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <p className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                    {n.title || 'Повідомлення проєкту'}
                  </p>
                  {isUnread && (
                    <span className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md bg-[#FA5A15]/15 border border-[#FA5A15]/30 text-[9px] font-black text-[#FA5A15] uppercase tracking-wider">
                      <CircleDot className="w-2 h-2 animate-pulse" />
                      Нове
                    </span>
                  )}
                </div>

                {cleanMsg && (
                  <p className="text-xs text-slate-300 break-words leading-relaxed font-medium">
                    {cleanMsg}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2 pt-1 border-t border-white/5">
                  <span className="text-[10px] font-mono font-medium text-slate-500">
                    {formatNotifTime(n.created_at)}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsView;
