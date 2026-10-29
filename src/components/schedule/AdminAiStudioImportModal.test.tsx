import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAiStudioImportModal from './AdminAiStudioImportModal';
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/context/ActiveShiftContext', () => ({ useActiveShift: () => ({ shiftId: 'shift-a' }) }));
vi.mock('@/lib/saveScheduleImport', () => ({ saveScheduleImport: save }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
beforeEach(() => { save.mockReset(); save.mockResolvedValue({ total: 2, skipped: 0 }); });

describe('admin schedule preview flow', () => {
  it('requires validation, preserves parallel teams, then saves the reviewed draft', async () => {
    const imported = vi.fn();
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={imported} />);
    const input = screen.getByLabelText('Крок 3 — вставити готовий JSON з AI Studio');
    fireEvent.change(input, { target: { value: JSON.stringify({ days: [{ date: '2026-10-29', items: [
      { title: 'Гра', time_start: '9:5', target_teams: [1] },
      { title: 'Гра', time_start: '9:5', target_teams: [2] },
    ] }] }) } });
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити розклад' }));
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0][0].items).toEqual([
      expect.objectContaining({ time_start: '09:05', target_teams: [1] }),
      expect.objectContaining({ time_start: '09:05', target_teams: [2] }),
    ]);
    await waitFor(() => expect(imported).toHaveBeenCalledWith('2026-10-29'));
  });
  it('blocks invalid dates and invalidates verification after editing', () => {
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={vi.fn()} />);
    const input = screen.getByLabelText('Крок 3 — вставити готовий JSON з AI Studio');
    fireEvent.change(input, { target: { value: '{"date":"2026-02-30","items":[{"title":"Гра","time_start":"10:00"}]}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити розклад' }));
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '[{"title":"Гра","time_start":"10:00"}]' } });
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити розклад' }));
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeEnabled();
    fireEvent.change(input, { target: { value: '[{"title":"Гра","time_start":"11:00"}]' } });
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
  });
});