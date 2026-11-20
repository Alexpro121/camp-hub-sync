import { useEffect, useState } from 'react';

export interface ViewportState {
  /** Видима висота над клавіатурою. */
  height: number;
  /** Зсув видимої області відносно сторінки (iOS прокручує сторінку під клавіатуру). */
  offsetTop: number;
  /** Скільки пікселів знизу перекриває клавіатура (iOS: сторінка не стискається). */
  keyboardInset: number;
  keyboard: boolean;
}

const read = (): ViewportState | null => {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  const vv = window.visualViewport;
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboardInset,
    keyboard: keyboardInset > 80 || vv.height < window.innerHeight * 0.75,
  };
};

/**
 * Видима область екрана з урахуванням екранної клавіатури.
 * iOS не зменшує сторінку, а накриває її клавіатурою — без цього нижні кнопки й поля
 * опиняються під клавіатурою; Android стискає сторінку, тоді keyboardInset ≈ 0.
 */
export function useVisualViewport(active = true): ViewportState | null {
  const [state, setState] = useState<ViewportState | null>(() => (active ? read() : null));
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) { setState(null); return; }
    const vv = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setState((prev) => {
        const next = read();
        if (!prev || !next) return next;
        return prev.height === next.height && prev.offsetTop === next.offsetTop && prev.keyboardInset === next.keyboardInset ? prev : next;
      }));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);
  return state;
}

const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]';

/** Після появи клавіатури підтягує поле у фокусі в центр видимої області прокрутки. */
export function keepFocusedFieldVisible(container: HTMLElement | null): () => void {
  if (!container) return () => {};
  let timer: ReturnType<typeof setTimeout>;
  const onFocus = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches?.(FIELD)) return;
    clearTimeout(timer);
    // Чекаємо, поки клавіатура доїде, — інакше прокрутка рахується від старої висоти.
    timer = setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
  };
  container.addEventListener('focusin', onFocus);
  return () => { clearTimeout(timer); container.removeEventListener('focusin', onFocus); };
}
