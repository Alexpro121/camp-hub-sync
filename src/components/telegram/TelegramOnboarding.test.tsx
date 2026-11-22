import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import TelegramOnboarding from './TelegramOnboarding';

const { tgApp, code } = vi.hoisted(() => ({ tgApp: vi.fn(), code: { value: null as string | null } }));
vi.mock('@/lib/telegramAuth', () => ({ tgApp, registrationCode: () => code.value, closeMiniApp: vi.fn() }));

beforeEach(() => { tgApp.mockReset(); code.value = null; });

it('lets a child find themselves and shows only the masked name for confirmation', async () => {
  tgApp.mockImplementation(async (action: string) => {
    if (action === 'reg_status') return { allowed: false, adminCandidate: false };
    if (action === 'child_teams') return { teams: [3, 5] };
    if (action === 'child_search') return { state: 'found', masked: 'Шевченко Т. Г.', team: 5, ticket: 't' };
    return {};
  });
  render(<TelegramOnboarding />);
  fireEvent.change(await screen.findByPlaceholderText('Прізвище та імʼя'), { target: { value: 'Шевченко Тарас' } });
  fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
  fireEvent.click(await screen.findByRole('button', { name: '5' }));
  await waitFor(() => expect(screen.getByText('Шевченко Т. Г.')).toBeVisible());
  expect(tgApp).toHaveBeenCalledWith('child_search', { name: 'Шевченко Тарас', team: 5 });
  expect(screen.queryByText('Реєстрація')).not.toBeInTheDocument();
});

it('shows staff registration only when the server accepts the registration link', async () => {
  code.value = 'reg_abc';
  tgApp.mockResolvedValue({ allowed: true, adminCandidate: false });
  render(<TelegramOnboarding />);
  expect(await screen.findByRole('heading', { name: 'Реєстрація' })).toBeVisible();
  expect(tgApp).toHaveBeenCalledWith('reg_status', { code: 'reg_abc' });
  expect(screen.getByRole('button', { name: 'Надіслати заявку' })).toBeDisabled();
});

it('falls back to the child flow when the registration code is rejected', async () => {
  code.value = 'reg_forged';
  tgApp.mockResolvedValue({ allowed: false, adminCandidate: false });
  render(<TelegramOnboarding />);
  expect(await screen.findByRole('heading', { name: 'Привіт! 👋' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Реєстрація' })).not.toBeInTheDocument();
});

it('registers by a shift invite link without choosing a kind and sends the link along', async () => {
  tgApp.mockImplementation(async (action: string) => {
    if (action === 'reg_status') return { allowed: true, adminCandidate: false, join: { shift: 'Коротка зміна 22.11–27.11' } };
    if (action === 'reg_submit') return { state: 'pending' };
    return {};
  });
  const tg = { requestContact: (cb: (ok: boolean) => void) => cb(true) };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: tg };
  render(<TelegramOnboarding join="idEBtTlYFtu4JX07oZ0Voa4P" />);
  expect(await screen.findByRole('heading', { name: 'Супровід зміни «Коротка зміна 22.11–27.11»' })).toBeVisible();
  expect(tgApp).toHaveBeenCalledWith('reg_status', { code: null, join: 'idEBtTlYFtu4JX07oZ0Voa4P' });
  expect(screen.queryByRole('button', { name: 'Каченя' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Прізвище та імʼя'), { target: { value: 'Коваль Олена' } });
  fireEvent.click(screen.getByRole('button', { name: '📱 Поділитися номером' }));
  fireEvent.click(screen.getByRole('button', { name: 'Зареєструватися' }));
  await waitFor(() => expect(tgApp).toHaveBeenCalledWith('reg_submit', { code: null, fullName: 'Коваль Олена', kind: 'supervisor', join: 'idEBtTlYFtu4JX07oZ0Voa4P' }));
});

it('says the shift link is invalid instead of offering the child login', async () => {
  tgApp.mockResolvedValue({ allowed: false, adminCandidate: false, joinInvalid: true, join: null });
  render(<TelegramOnboarding join="idEBtTlYFtu4JX07oZ0Voa4P" />);
  expect(await screen.findByText(/посилання на зміну вже недійсне/)).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Привіт! 👋' })).not.toBeInTheDocument();
});
