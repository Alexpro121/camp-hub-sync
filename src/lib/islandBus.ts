export type IslandTone = 'info' | 'success' | 'danger' | 'warning' | 'gradient';

export interface IslandMessage {
  id: string;
  text: string;
  tone: IslandTone;
  meta?: string;
  ttl?: number;
}

type Listener = (m: IslandMessage) => void;

const listeners = new Set<Listener>();

export function onIslandMessage(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pushIsland(text: string, tone: IslandTone = 'info', meta?: string, ttl = 5000) {
  const msg: IslandMessage = { id: crypto.randomUUID(), text, tone, meta, ttl };
  listeners.forEach((l) => l(msg));
  return msg;
}

export const TONE_CLASSES: Record<IslandTone, string> = {
  info: 'bg-surface-3 text-foreground border-border',
  success: 'bg-success text-success-foreground border-success',
  danger: 'bg-destructive text-destructive-foreground border-destructive',
  warning: 'bg-warning text-warning-foreground border-warning',
  gradient: 'bg-gradient-primary text-primary-foreground border-primary/50',
};

export const TONE_LABELS: Record<IslandTone, string> = {
  danger: 'Тривога / збір',
  success: 'Перекличка / інфо',
  warning: 'Увага',
  gradient: 'Позитив',
  info: 'Нейтральне',
};