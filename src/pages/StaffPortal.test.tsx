import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StaffPortal from './StaffPortal';
const { call, getUser } = vi.hoisted(() => ({ call: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser } } }));
vi.mock('@/lib/staffApi', () => ({ staffCall: call, staffErr: () => 'Помилка', KIND_LABEL: {}, compressAvatar: vi.fn() }));
vi.mock('@/lib/staffTheme', () => ({ useStaffTheme: () => ['dark', vi.fn()] }));
vi.mock('@/components/ui/loader', () => ({ FullScreenLoader: () => <div role="status">Завантаження</div> }));
beforeEach(() => { call.mockReset(); getUser.mockResolvedValue({ data: { user: { id: 'non-staff' } } }); localStorage.clear(); });
it('shows staff login for a valid non-staff session without rejecting or signing it out', async () => {
  call.mockResolvedValue({ cabinet: null });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Вхід для супроводу' })).toBeVisible());
  expect(call).toHaveBeenCalledWith({ action: 'cabinet', allow_missing: true }, { signal: expect.any(AbortSignal) });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('ignores an invalid cached team and opens the staff cabinet instead of a broken shift', async () => {
  localStorage.setItem('helpsuprov:supervisor-team', 'NaN');
  call.mockResolvedValue({ full_name: 'Тестовий Супровід', login: 'test', kind: 'supervisor', assignments: [], phone: null, telegram: null, avatar_url: null });
  render(<MemoryRouter><StaffPortal /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Тестовий Супровід' })).toBeVisible());
});