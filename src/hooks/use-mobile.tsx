import * as React from "react";

const DEFAULT_MOBILE_BREAKPOINT = 768;

/**
 * Хук для реактивного визначення мобільних екранів.
 * Працює на базі нативного matchMedia без примусового Reflow DOM.
 * 
 * @param breakpoint - ширина брейкпоїнту в пікселях (за замовчуванням 768px)
 * @returns boolean - true якщо ширина екрана менша за вказаний брейкпоїнт
 */
export function useIsMobile(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT): boolean {
  // Ініціалізуємо актуальний стан без однокадрового мерехтіння
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Встановлюємо точне значення при першому запуску ефекту
    updateMatches(mql);

    // Сучасні браузери (Chrome, Safari 14+, Firefox)
    if (mql.addEventListener) {
      mql.addEventListener("change", updateMatches);
      return () => mql.removeEventListener("change", updateMatches);
    } else {
      // Fallback для старих версій iOS Safari / WebKit
      // @ts-expect-error legacy Safari support
      mql.addListener(updateMatches);
      // @ts-expect-error legacy Safari support
      return () => mql.removeListener(updateMatches);
    }
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
