/** Тестова зміна (shifts.is_test): підпис «21.11 о 23:59» за Києвом і чи вона ще відкрита. */
export function testClosesLabel(expiresAt: string): string {
  const d = new Date(expiresAt);
  const date = d.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} о ${time}`;
}

export const testShiftOpen = (expiresAt: string | null | undefined, now = Date.now()) =>
  Boolean(expiresAt) && Date.parse(String(expiresAt)) > now;

/** Параметр ?enter=<призначення> з кнопки запрошення; одразу прибирається з адреси. */
export function takeEnterParam(): string | null {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('enter');
    if (!id) return null;
    url.searchParams.delete('enter');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
