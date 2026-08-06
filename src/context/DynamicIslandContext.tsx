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
  | 'BROADCAST';

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
}

interface IslandApi {
  state: IslandState;
  payload: IslandPayload;
  showLoader: () => void;
  showExcelProgress: (progress: number, fileName?: string) => void;
  showOffline: (queuedActionsCount: number) => void;
  showSuccess: (title: string, subtitle?: string) => void;
  showError: (title: string, subtitle?: string, errorDetails?: string) => void;
  showBroadcast: (color: BroadcastColor, message: string, author: string) => void;
  hide: () => void;
}

const Ctx = createContext<IslandApi | null>(null);

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const haptics = useHaptics();
  const { online, pending } = useNetworkStatus();

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const set = useCallback((next: IslandState, p: IslandPayload = {}, autoHide?: number) => {
    clearTimer();
    setState(next);
    setPayload(p);
    if (autoHide) timer.current = setTimeout(() => setState('HIDDEN'), autoHide);
  }, []);

  const hide = useCallback(() => { clearTimer(); setState('HIDDEN'); }, []);
  const showLoader = useCallback(() => set('LOADING_ONLY'), [set]);
  const showExcelProgress = useCallback((progress: number, fileName?: string) => {
    set('EXCEL_IMPORT', { progress: Math.max(0, Math.min(100, Math.round(progress))), fileName });
  }, [set]);
  const showOffline = useCallback((queued: number) => set('OFFLINE', { queued }), [set]);
  const showSuccess = useCallback((title: string, subtitle?: string) => {
    haptics.notification('success');
    set('SUCCESS_TOAST', { title, subtitle }, 4500);
  }, [set, haptics]);
  const showError = useCallback((title: string, subtitle?: string, errorDetails?: string) => {
    haptics.notification('error');
    set('ERROR_TOAST', { title, subtitle, errorDetails }, 7000);
  }, [set, haptics]);
  const showBroadcast = useCallback((color: BroadcastColor, message: string, author: string) => {
    haptics.impact('heavy');
    set('BROADCAST', { color, message, author }, 9000);
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
    state, payload, showLoader, showExcelProgress, showOffline, showSuccess, showError, showBroadcast, hide,
  }), [state, payload, showLoader, showExcelProgress, showOffline, showSuccess, showError, showBroadcast, hide]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useDynamicIsland = (): IslandApi => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDynamicIsland must be used inside <DynamicIslandProvider>');
  return ctx;
};