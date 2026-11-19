import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StaffPortal from './StaffPortal';

const { call, getUser, signIn } = vi.hoisted(() => ({ call: vi.fn(), getUser: vi.fn(), signIn: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser } } }));
vi.mock('@/lib/staffApi', () => ({ staffCall: call, staffErr: () => 'Помилка', KIND_LABEL: {}, compressAvatar: vi.fn(), initials: () => 'ТС' }));
vi.mock('@/lib/staffTheme', () => ({ useStaffTheme: () => ['dark', vi.fn()] }));
vi.mock('@/components/ui/loader', () => ({ FullScreenLoader: () => <div role="status">Завантаження</div> }));
vi.mock('@/lib/telegramAuth', () => ({ isTelegramMiniApp: () => true, telegramSignIn: signIn, closeMiniApp: vi.fn() }));

beforeEach(() => {
  call.mockReset();
  signIn.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'staff-user' } } });
  localStorage.clear();
});

it('never shows the staff login form inside Telegram for an unlinked account', async () => {
  signIn.mockResolvedValue({ state: 'unlinked' });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Спершу увійди в боті' })).toBeVisible());
  expect(screen.queryByRole('heading', { name: 'Вхід для супроводу' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it('shows a pending notice while an admin has not approved /register', async () => {
  signIn.mockResolvedValue({ state: 'pending' });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Заявка на розгляді' })).toBeVisible());
});

it('opens the cabinet of an approved staff member without a logout button', async () => {
  signIn.mockResolvedValue({ state: 'ok', role: 'staff', kind: 'supervisor', fullName: 'Коваль Олена' });
  call.mockResolvedValue({ full_name: 'Коваль Олена', login: 'tg42', kind: 'supervisor', assignments: [], phone: null, telegram: null, avatar_url: null });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Коваль Олена' })).toBeVisible());
  expect(screen.queryByRole('button', { name: /Вийти/ })).not.toBeInTheDocument();
});

it('treats a signed-in account without a staff profile as revoked, not as a login prompt', async () => {
  signIn.mockResolvedValue({ state: 'ok', role: 'staff', kind: 'supervisor', fullName: 'X' });
  call.mockResolvedValue({ cabinet: null });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Доступ вимкнено' })).toBeVisible());
});
