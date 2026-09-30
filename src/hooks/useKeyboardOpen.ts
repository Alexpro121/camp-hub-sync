import { useEffect, useState } from 'react';

/**
 * [L-2] Detects an on-screen keyboard in Telegram / Android / iOS WebViews.
 * The visual viewport shrinks well below the layout viewport while the keyboard
 * is up, which lets us hide the floating dock so it never covers an input.
 */
export function useKeyboardOpen(threshold = 0.75): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Android WebView часто змінює і innerHeight — тому також слухаємо фокус полів.
    const isField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      return !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)
        && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes((t as HTMLInputElement).type);
    };
    let focused = isField(document.activeElement);
    const onIn = (e: FocusEvent) => { if (isField(e.target)) { focused = true; setOpen(true); } };
    const onOut = () => { focused = false; setTimeout(() => { if (!isField(document.activeElement)) update(); }, 50); };
    window.addEventListener('focusin', onIn);
    window.addEventListener('focusout', onOut);
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    const update = () => setOpen(focused || (!!vv && vv.height < window.innerHeight * threshold));
    update();
    if (!vv) return () => { window.removeEventListener('focusin', onIn); window.removeEventListener('focusout', onOut); };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', onIn);
      window.removeEventListener('focusout', onOut);
    };
  }, [threshold]);

  return open;
}

export default useKeyboardOpen;
