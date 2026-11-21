/** Тестова зміна (shifts.is_test): підпис «21.11 о 23:59» за Києвом і чи вона ще відкрита. */
export function testClosesLabel(expiresAt: string): string {
  const d = new Date(expiresAt);
  const date = d.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} о ${time}`;
}

export const testShiftOpen = (expiresAt: string | null | undefined, now = Date.now()) =>
  Boolean(expiresAt) && Date.parse(String(expiresAt)) > now;

/** Параметр ?pick=<токен посилання зміни> з кнопки запрошення; одразу прибирається з адреси. */
export function takePickParam(): string | null {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('pick');
    if (!token) return null;
    url.searchParams.delete('pick');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return /^[A-Za-z0-9_-]{16,64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** Те саме без зміни адреси (для початкового стану: у StrictMode ініціалізатор викликається двічі). */
export function readPickParam(): string | null {
  try {
    const token = new URL(window.location.href).searchParams.get('pick');
    return token && /^[A-Za-z0-9_-]{16,64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}
