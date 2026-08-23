import { useEffect, useState } from 'react';

/**
 * [L-2] Detects an on-screen keyboard in Telegram / Android / iOS WebViews.
 * The visual viewport shrinks well below the layout viewport while the keyboard
 * is up, which lets us hide the floating dock so it never covers an input.
 */
export function useKeyboardOpen(threshold = 0.75): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!vv) return;
    const update = () => setOpen(vv.height < window.innerHeight * threshold);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [threshold]);

  return open;
}

export default useKeyboardOpen;
