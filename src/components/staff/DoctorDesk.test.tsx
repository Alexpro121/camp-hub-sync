import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/staffApi', () => ({ staffCall: call }));
import DoctorDesk from './DoctorDesk';

const id = '11111111-1111-4111-8111-111111111111';
const medical = { child_id: id, note: 'Попередня помітка', needs_attention: true, version: 1, updated_at: '2026-10-29' };
const dataset = { children: [{ id, shift_id: 'shift1', full_name: 'Коваль Олена', team_number: 4, phone: null, gender: 'girl', iron_dollars: 0, is_present: false }], shifts: [{ id: 'shift1', name: 'WOW' }], assignments: [{ shift_id: 'shift1', team_number: 4, staff_members: { full_name: 'Супровід Коваль', kind: 'supervisor', is_active: true } }], medical: [medical] };
const props = { name: 'Лікар', theme: 'dark', toggleTheme: vi.fn(), onLogout: vi.fn() };
beforeEach(() => { call.mockReset(); localStorage.setItem('helpsuprov:doctor-tour-seen', '1'); props.onLogout.mockClear(); call.mockResolvedValue(dataset); });
afterEach(cleanup);

describe('doctor workflow', () => {
  it('saves a medical mark without a presence update', async () => {
    render(<DoctorDesk {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Коваль Олена/ }));
    fireEvent.change(screen.getByLabelText('Нотатка лікаря'), { target: { value: 'Потрібен огляд' } });
    call.mockResolvedValueOnce({ medical: { ...medical, note: 'Потрібен огляд', version: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(call).toHaveBeenLastCalledWith({ action: 'doctor_save', child_id: id, note: 'Потрібен огляд', needs_attention: true, version: 1 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('removes the attention mark', async () => {
    render(<DoctorDesk {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Коваль Олена/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати червоний плюсик' }));
    call.mockResolvedValueOnce({ medical: { ...medical, needs_attention: false, version: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ needs_attention: false, version: 1 })));
  });
  it('preserves the draft when a concurrent doctor edit conflicts', async () => {
    render(<DoctorDesk {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Коваль Олена/ }));
    fireEvent.change(screen.getByLabelText('Нотатка лікаря'), { target: { value: 'Мій текст' } });
    call.mockRejectedValueOnce(new Error('medical_note_conflict'));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled());
    expect(screen.getByLabelText('Нотатка лікаря')).toHaveValue('Мій текст');
  });
  it('clears access when server revokes the doctor role', async () => {
    call.mockRejectedValueOnce(new Error('forbidden'));
    render(<DoctorDesk {...props} />);
    await waitFor(() => expect(props.onLogout).toHaveBeenCalledTimes(1));
  });
});