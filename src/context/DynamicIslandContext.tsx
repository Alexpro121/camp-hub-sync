import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Optional semantic hint for icon selection. */
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

/** Every notification collapses on its own after 6–12 seconds. */
const AUTO_HIDE_MS = 6000;

/** Smart duration scale: 12s critical, 8s expanded/offline, 6s default. */
function getSmartDuration(state: IslandState, expanded = false): number {
  if (state === 'BROADCAST' || state === 'ERROR_TOAST') return 12000;
  if (expanded || state === 'OFFLINE' || state === 'EVENT_ALERT') return 8000;
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
  const autoHideMs = useRef<number | null>(null);
  const haptics = useHaptics();
  const { online, pending } = useNetworkStatus();

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  /** Unified, unconditional auto-dismiss timer. */
  const startAutoDismissTimer = useCallback((next: IslandState, expandedNow = false, override?: number) => {
    clearTimer();
    if (next === 'HIDDEN') { autoHideMs.current = null; return; }
    const duration = override ?? getSmartDuration(next, expandedNow);
    autoHideMs.current = duration;
    timer.current = setTimeout(() => {
      setState('HIDDEN');
      setExpanded(false);
      timer.current = null;
    }, duration);
  }, []);

  const set = useCallback((next: IslandState, p: IslandPayload = {}, autoHide?: number) => {
    setExpanded(false);
    setState(next);
    setPayload(p);
    // Every state auto-dismisses — never leave a stuck pill.
    startAutoDismissTimer(next, false, autoHide);
  }, [startAutoDismissTimer]);

  const hide = useCallback(() => { clearTimer(); setExpanded(false); setState('HIDDEN'); }, []);

  /** Interaction pauses the countdown so the text can be read calmly. */
  const pauseAutoHide = useCallback(() => { clearTimer(); }, []);
  const resumeAutoHide = useCallback(() => {
    clearTimer();
    if (autoHideMs.current) {
      timer.current = setTimeout(() => { setState('HIDDEN'); setExpanded(false); }, autoHideMs.current);
    }
  }, []);
  const toggleExpanded = useCallback(() => {
    setExpanded((v) => {
      const next = !v;
      // Expanding restarts an 8s countdown; it always collapses and hides after it.
      setState((s) => { startAutoDismissTimer(s, next); return s; });
      return next;
    });
  }, [startAutoDismissTimer]);

  const showLoader = useCallback(() => set('LOADING_ONLY'), [set]);
  const showExcelProgress = useCallback((progress: number, fileName?: string) => {
    set('EXCEL_IMPORT', { progress: Math.max(0, Math.min(100, Math.round(progress))), fileName });
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

  // 1. Network detector — offline persists, online shows a short toast
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      showOffline(pending);
    } else if (wasOffline.current) {
      wasOffline.current = false;
      set('SUCCESS_TOAST', { title: 'Онлайн', subtitle: 'Зв’язок відновлено' }, 2000);
    }
  }, [online, pending, showOffline, set]);

  // 3. Realtime broadcasts from supervisors
  useEffect(() => {
    const ch = supabase
      .channel('island-broadcasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (p) => {
        const b = p.new as { message?: string; color?: string; sent_by?: string };
        showBroadcast(TONE_TO_COLOR[b.color ?? 'info'] ?? 'red', b.message ?? '', b.sent_by ?? 'Супровід');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [showBroadcast]);

  // Bridge legacy islandBus messages into the new island
  useEffect(() => {
    const off = onIslandMessage((m) => {
      if (m.tone === 'danger' || m.tone === 'warning') showError(m.text, m.meta);
      else showSuccess(m.text, m.meta);
    });
    return () => { off(); clearTimer(); };
  }, [showError, showSuccess]);

  const value = useMemo<IslandApi>(() => ({
    state, payload, expanded, showLoader, showExcelProgress, showOffline, showSuccess, showError,
    showBroadcast, showEventAlert, toggleExpanded, pauseAutoHide, resumeAutoHide, hide,
  }), [state, payload, expanded, showLoader, showExcelProgress, showOffline, showSuccess, showError,
    showBroadcast, showEventAlert, toggleExpanded, pauseAutoHide, resumeAutoHide, hide]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useDynamicIsland = (): IslandApi => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDynamicIsland must be used inside <DynamicIslandProvider>');
  return ctx;
};