import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppNotification } from '@/types/app';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Bell, Trash2, AlertTriangle, CircleDot } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { InlineLoader } from '@/components/ui/loader';

interface Props {
  myTeam: number;
}

const SEEN_KEY = (team: number) => `helpsuprov:notif-seen:${team}`;
const CLEARED_KEY = (team: number) => `helpsuprov:notif-cleared:${team}`;

const NotificationsView = ({ myTeam }: Props) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  // ISO timestamp before mount — anything newer is "unread" for this team
  const [seenBefore, setSeenBefore] = useState<string>(() => {
    return localStorage.getItem(SEEN_KEY(myTeam)) || '1970-01-01T00:00:00.000Z';
  });
  // ISO timestamp of last "clear" — items older than this are hidden for this team only
  const [clearedBefore, setClearedBefore] = useState<string>(() => {
    return localStorage.getItem(CLEARED_KEY(myTeam)) || '1970-01-01T00:00:00.000Z';
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      setItems((data || []) as AppNotification[]);
      setLoading(false);
    };
    load();
    const ch = supabase
      .channel('notif-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
        setItems((prev) => [p.new as AppNotification, ...prev].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Mark all currently visible items as read for this team when component is shown
  useEffect(() => {
    const now = new Date().toISOString();
    // Defer slightly so the unread badge can render once before being cleared
    const t = setTimeout(() => {
      localStorage.setItem(SEEN_KEY(myTeam), now);
      setSeenBefore(now);
    }, 1500);
    return () => clearTimeout(t);
  }, [myTeam]);

  const visibleItems = useMemo(
    () => items.filter((n) => n.created_at > clearedBefore),
    [items, clearedBefore],
  );

  const clearForMe = () => {
    const now = new Date().toISOString();
    localStorage.setItem(CLEARED_KEY(myTeam), now);
    localStorage.setItem(SEEN_KEY(myTeam), now);
    setClearedBefore(now);
    setSeenBefore(now);
    toast.success('Стрічку очищено для твоєї команди');
  };

  if (loading) {
    return <InlineLoader label="Завантаження подій" />;
  }

  if (visibleItems.length === 0) {
    return (
      <Card className="p-8 text-center bg-gradient-card animate-fade-in">
        <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-muted-foreground text-sm">Стрічка порожня</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {visibleItems.length} {visibleItems.length === 1 ? 'подія' : 'подій'}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Очистити
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Очистити стрічку сповіщень?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Будуть приховані всі поточні сповіщення для команди <span className="font-bold text-primary">#{myTeam}</span>.
                <span className="block mt-2 text-foreground/80">
                  Сповіщення можуть містити важливу інформацію — переконайся, що ти все прочитав.
                </span>
                <span className="block mt-2 text-[11px] text-muted-foreground">
                  Інші команди й адміністратор продовжать бачити ці сповіщення.
                  Нові події після очищення з'являться як зазвичай.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={clearForMe} className="bg-destructive hover:bg-destructive/90">
                Так, очистити
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="space-y-2">
        {visibleItems.map((n) => {
          const isUnread = n.created_at > seenBefore;
          return (
            <Card
              key={n.id}
              className={`p-3 flex items-start gap-3 animate-slide-up transition-smooth ${
                isUnread
                  ? 'bg-gradient-card border-primary/40 shadow-glow'
                  : 'bg-card/60 border-border/40'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isUnread ? 'bg-primary/20' : 'bg-secondary'
              }`}>
                <ArrowLeftRight className={`w-4 h-4 ${isUnread ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {isUnread && (
                    <CircleDot className="w-3 h-3 text-primary animate-pulse-glow rounded-full shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground break-words">{n.message}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider">
                  {new Date(n.created_at).toLocaleString('uk-UA')}
                  {isUnread && <span className="ml-2 text-primary font-bold">· нове</span>}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsView;
