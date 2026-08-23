import { 
  createContext, 
  useCallback, 
  useContext, 
  useEffect, 
  useMemo, 
  useRef, 
  useState, 
  type ReactNode 
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { onIslandMessage } from '@/lib/islandBus';
import { useHaptics } from '@/hooks/useHaptics';

export type IslandState =
  | 'HIDDEN'
  | 'LOADING_ONLY'
  | 'EXCEL_IMPORT'
  | 'OFFLINE'
  | 'SUCCESS_TOAST'
  | 'ERROR_TOAST'
  | 'BROADCAST'
  | 'EVENT_ALERT';

export type BroadcastColor = 'red' | 'green' | 'purple' | 'orange';

export interface IslandPayload {
  progress?: number;
  fileName?: string;
  queued?: number;
  title?: string;
  subtitle?: string;
  errorDetails?: string;
  color?: BroadcastColor;
  message?: string;
  author?: string;
  /** EVENT_ALERT */
  eventTitle?: string;
  range?: string;
  myTime?: string | null;
  myTeams?: number[] | null;
  phase?: 'pre' | 'start';
  category?: string | null;
  location?: string | null;
  /** Семантична підказка для вибору іконки */
  type?: 'TRAIN' | 'COUPES_SWAP' | 'COINS' | 'GENERIC';
  isSchedule?: boolean;
}

export interface EventAlert {
  eventTitle: string;
  range: string;
  subtitle?: string;
  myTime?: string | null;
  myTeams?: number[] | null;
  phase?: 'pre' | 'start';
  category?: string | null;
  location?: string | null;
}

interface IslandApi {
  state: IslandState;
  payload: IslandPayload;
  expanded: boolean;
  showLoader: () => void;
  showExcelProgress: (progress: number, fileName?: string) => void;
  showOffline: (queuedActionsCount: number) => void;
  showSuccess: (title: string, subtitle?: string) => void;
  showError: (title: string, subtitle?: string, errorDetails?: string) => void;
  showBroadcast: (color: BroadcastColor, message: string, author: string) => void;
  showEventAlert: (alert: EventAlert) => void;
  toggleExpanded: () => void;
  pauseAutoHide: () => void;
  resumeAutoHide: () => void;
  hide: () => void;
}

const Ctx = createContext<IslandApi | null>(null);

/** Базова тривалість показу за замовчуванням (6 секунд) */
const AUTO_HIDE_MS = 6000;

/** Розумна шкала тривалості: 12с критичні, 8с розширені/події, 7с офлайн, 6с стандарт */
function getSmartDuration(state: IslandState, expanded = false): number {
  if (state === 'BROADCAST' || state === 'ERROR_TOAST') return 12000;
  if (expanded || state === 'EVENT_ALERT') return 8000;
  if (state === 'OFFLINE') return 7000;
  return AUTO_HIDE_MS;
}

const TONE_TO_COLOR: Record<string, BroadcastColor> = {
  danger: 'red',
  success: 'green',
  gradient: 'purple',
  warning: 'orange',
  info: 'purple',
};

export const DynamicIslandProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<IslandState>('HIDDEN');
  const [payload, setPayload] = useState<IslandPayload>({});
  const [expanded, setExpanded] = useState(false);
  
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTime = useRef<number>(AUTO_HIDE_MS);
  const startTime = useRef<number>(0);
  const isPaused = useRef<boolean>(false);
  
  const haptics = useHaptics();
  const { online, pending } = useNetworkStatus();

  const clearTimer = useCallback(() => { 
    if (timer.current) { 
      clearTimeout(timer.current); 
      timer.current = null; 
    } 
  }, []);

  /** Універсальний таймер автоматичного приховування острова */
  const startAutoDismissTimer = useCallback((nextState: IslandState, expandedNow = false, overrideMs?: number) => {
    clearTimer();
    isPaused.current = false;
    
    if (nextState === 'HIDDEN') return;

    const duration = overrideMs ?? getSmartDuration(nextState, expandedNow);
    remainingTime.current = duration;
    startTime.current = Date.now();

    timer.current = setTimeout(() => {
      setState('HIDDEN');
      setExpanded(false);
      timer.current = null;
    }, duration);
  }, [clearTimer]);

  const set = useCallback((nextState: IslandState, nextPayload: IslandPayload = {}, autoHideMs?: number) => {
    setExpanded(false);
    setState(nextState);
    setPayload(nextPayload);
    startAutoDismissTimer(nextState, false, autoHideMs);
  }, [startAutoDismissTimer]);

  const hide = useCallback(() => { 
    clearTimer(); 
    isPaused.current = false;
    setExpanded(false); 
    setState('HIDDEN'); 
  }, [clearTimer]);

  /** Пауза таймера при взаємодії користувача (читанні/наведенні) */
  const pauseAutoHide = useCallback(() => { 
    if (!timer.current || isPaused.current) return;
    clearTimer();
    isPaused.current = true;
    const elapsed = Date.now() - startTime.current;
    remainingTime.current = Math.max(1500, remainingTime.current - elapsed);
  }, [clearTimer]);

  /** Продовження відліку після взаємодії */
  const resumeAutoHide = useCallback(() => {
    if (!isPaused.current || state === 'HIDDEN') return;
    clearTimer();
    isPaused.current = false;
    
    startTime.current = Date.now();
    timer.current = setTimeout(() => { 
      setState('HIDDEN'); 
      setExpanded(false); 
      timer.current = null;
    }, remainingTime.current);
  }, [clearTimer, state]);

  /** Плавне розгортання та згортання острова */
  const toggleExpanded = useCallback(() => {
    haptics.impact('light');
    setExpanded((prev) => {
      const next = !prev;
      // Безпечно перезапускаємо таймер для нового стану
      setTimeout(() => startAutoDismissTimer(state, next), 0);
      return next;
    });
  }, [haptics, startAutoDismissTimer, state]);

  // Спеціалізовані методи API
  const showLoader = useCallback(() => set('LOADING_ONLY'), [set]);
  
  const showExcelProgress = useCallback((progress: number, fileName?: string) => {
    set('EXCEL_IMPORT', { 
      progress: Math.max(0, Math.min(100, Math.round(progress))), 
      fileName 
    });
  }, [set]);

  const showOffline = useCallback((queued: number) => set('OFFLINE', { queued }), [set]);

  const showSuccess = useCallback((title: string, subtitle?: string) => {
    haptics.notification('success');
    set('SUCCESS_TOAST', { title, subtitle });
  }, [set, haptics]);

  const showError = useCallback((title: string, subtitle?: string, errorDetails?: string) => {
    haptics.notification('error');
    set('ERROR_TOAST', { title, subtitle, errorDetails });
  }, [set, haptics]);

  const showBroadcast = useCallback((color: BroadcastColor, message: string, author: string) => {
    haptics.impact('heavy');
    set('BROADCAST', { color, message, author });
  }, [set, haptics]);

  const showEventAlert = useCallback((alert: EventAlert) => {
    haptics.notification('warning');
    set('EVENT_ALERT', { ...alert });
  }, [set, haptics]);

  // 1. Детектор мережі: офлайн / повернення онлайн
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      showOffline(pending);
    } else if (wasOffline.current) {
      wasOffline.current = false;
      set('SUCCESS_TOAST', { title: 'Онлайн', subtitle: 'Зв’язок відновлено' }, 3000);
    }
  }, [online, pending, showOffline, set]);

  // 2. Realtime-сповіщення від супроводу (Broadcasts)
  useEffect(() => {
    const ch = supabase
      .channel('island-broadcasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (p) => {
        const b = p.new as { message?: string; color?: string; sent_by?: string };
        showBroadcast(
          TONE_TO_COLOR[b.color ?? 'info'] ?? 'red', 
          b.message ?? '', 
          b.sent_by ?? 'Супровід'
        );
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [showBroadcast]);

  // 3. Міст для подій (ВИПРАВЛЕНО: тільки danger викликає помилку showError)
  useEffect(() => {
    const off = onIslandMessage((m) => {
      if (m.tone === 'danger') {
        showError(m.text, m.meta);
      } else {
        // Усі позитивні та інформаційні події (ярмарок, нарахування тощо) показуються без помилкового червоного знака оклику
        showSuccess(m.text, m.meta);
      }
    });

    return () => { 
      off(); 
      clearTimer(); 
    };
  }, [showError, showSuccess, clearTimer]);

  // Очищення таймерів при демонтажі
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const value = useMemo<IslandApi>(() => ({
    state, 
    payload, 
    expanded, 
    showLoader, 
    showExcelProgress, 
    showOffline, 
    showSuccess, 
    showError,
    showBroadcast, 
    showEventAlert, 
    toggleExpanded, 
    pauseAutoHide, 
    resumeAutoHide, 
    hide,
  }), [
    state, 
    payload, 
    expanded, 
    showLoader, 
    showExcelProgress, 
    showOffline, 
    showSuccess, 
    showError,
    showBroadcast, 
    showEventAlert, 
    toggleExpanded, 
    pauseAutoHide, 
    resumeAutoHide, 
    hide
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useDynamicIsland = (): IslandApi => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useDynamicIsland must be used inside <DynamicIslandProvider>');
  }
  return ctx;
};
