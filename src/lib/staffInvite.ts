/** Текст запрошення супроводу на зміну: посилання в Telegram-бот (якщо бот налаштований) і на сайт. */
export function staffInviteText(shiftName: string, token: string, botLink?: string | null, origin = window.location.origin): string {
  const web = `${origin}/staff/join/${token}`;
  if (!botLink) return web;
  return [`Реєстрація супроводу · ${shiftName}`, `Telegram: ${botLink}`, `Сайт: ${web}`].join('\n');
}
