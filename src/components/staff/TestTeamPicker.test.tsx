import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TestTeamPicker from './TestTeamPicker';

const calls: Record<string, unknown>[] = [];
vi.mock('@/lib/staffApi', () => ({
  staffErr: () => 'err',
  staffCall: (body: Record<string, unknown>) => {
    calls.push(body);
    if (body.action === 'invite_check') {
      return Promise.resolve({ shift: { id: 'S', name: '🧪 Тестова зміна' }, teams: [
        { team: 1, children: 34, staff: ['Іван Петренко'] }, { team: 2, children: 34, staff: [] },
      ] });
    }
    return Promise.resolve({ ok: true, shift_id: 'S', team_number: body.team_number });
  },
}));

describe('test shift team picker', () => {
  it('lets the supervisor choose the team number and joins exactly that team', async () => {
    const onJoined = vi.fn();
    render(<TestTeamPicker token="EWXo7yweOUShukVLppqcykovUS2EIjdI" onJoined={onJoined} onClose={vi.fn()} />);
    const team2 = await screen.findByRole('radio', { name: /№2/ });
    expect(screen.getByText('Поки без супроводу')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Оберіть команду' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(team2);
    fireEvent.click(screen.getByRole('button', { name: 'Увійти в команду №2' }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('S', 2));
    expect(calls).toContainEqual({ action: 'join_shift', token: 'EWXo7yweOUShukVLppqcykovUS2EIjdI', team_number: 2 });
  });
});
