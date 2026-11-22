import { expect, it } from 'vitest';
import { staffInviteText } from '@/lib/staffInvite';

it('дає посилання для Telegram і сайту, а без бота — лише сайт', () => {
  expect(staffInviteText('Ендюранс', 'tok123', 'https://t.me/bot?start=join_tok123', 'https://app.example'))
    .toBe('Реєстрація супроводу · Ендюранс\nTelegram: https://t.me/bot?start=join_tok123\nСайт: https://app.example/staff/join/tok123');
  expect(staffInviteText('Ендюранс', 'tok123', null, 'https://app.example')).toBe('https://app.example/staff/join/tok123');
});
