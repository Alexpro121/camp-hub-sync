import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAiStudioImportModal from './AdminAiStudioImportModal';
const { save, generate } = vi.hoisted(() => ({ save: vi.fn(), generate: vi.fn() }));
vi.mock('@/lib/generateSchedule', () => ({ generateSchedule: generate }));
vi.mock('@/context/ActiveShiftContext', () => ({ useActiveShift: () => ({ shiftId: 'shift-a' }) }));
vi.mock('@/lib/saveScheduleImport', () => ({ saveScheduleImport: save }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
beforeEach(() => { generate.mockReset(); save.mockReset(); save.mockResolvedValue({ total: 2, skipped: 0 }); });

describe('admin schedule preview flow', () => {
  it('saves exercise ending at 09:00 before breakfast with four arrivals', async () => {
    const items = [
      { title: 'Зарядка', time_start: '08:30', time_end: '09:15', description: 'Завершення орієнтовне', target_teams: [] },
      { title: 'Сніданок', time_start: '09:00', time_end: '10:00', target_teams: [], sub_slots: ['09:00', '09:15', '09:30', '09:45'].map((time, index) => ({ time, teams: [index + 1] })) },
    ];
    const json = JSON.stringify({ days: [{ date: '2026-10-29', items }] });
    generate.mockImplementation(async (_raw, _date, _signal, onText) => { onText(json); return json; });
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Текст розкладу'), { target: { value: '08:30 Зарядка\n09:00–10:00 Сніданок, 4 заїзди' } });
    fireEvent.click(screen.getByRole('button', { name: 'Згенерувати розклад' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0][0][0].items;
    expect(saved[0]).toMatchObject({ time_start: '08:30', time_end: '09:00' });
    expect(saved[1]).toMatchObject({ time_start: '09:00', time_end: '10:00' });
    expect(saved[1].sub_slots).toHaveLength(4);
  });
  it('shows complete events while generation is still running and blocks draft saving', async () => {
    let finish: ((value: string) => void) | undefined;
    const partial = '{"days":[{"date":"2026-02-24","items":[{"title":"Підйом","time_start":"08:00","time_end":"08:00"}';
    generate.mockImplementation((_raw, _date, _signal, onText) => { onText(partial); return new Promise<string>((resolve) => { finish = resolve; }); });
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Текст розкладу'), { target: { value: '08:00 Підйом' } });
    fireEvent.click(screen.getByRole('button', { name: 'Згенерувати розклад' }));
    expect(await screen.findByText('Підйом')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
    finish?.(partial + ']}]}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0][0].items[0].time_end).toBeNull();
  });
  it('generates inside the modal and validates before draft save', async () => {
    const json = '{"days":[{"date":"2026-10-29","items":[{"title":"Сніданок","time_start":"09:00","time_end":"10:00"}]}]}';
    generate.mockImplementation(async (_raw, _date, _signal, onText) => { onText(json); return json; });
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Текст розкладу'), { target: { value: '09:00–10:00 Сніданок' } });
    fireEvent.click(screen.getByRole('button', { name: 'Згенерувати розклад' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeEnabled());
    expect(generate).toHaveBeenCalledWith('09:00–10:00 Сніданок', '2026-10-29', expect.any(AbortSignal), expect.any(Function));
    expect(save).not.toHaveBeenCalled();
  });
  it('does not retain failed partial generation as an importable document', async () => {
    generate.mockImplementation(async (_raw, _date, _signal, onText) => { onText('[{"title":"Гра","time_start":"10:00"}]'); throw new Error('Stream interrupted'); });
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Текст розкладу'), { target: { value: '10:00 Гра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Згенерувати розклад' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Stream interrupted'));
    expect(screen.getByRole('button', { name: 'Зберегти перевірену чернетку' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
  it('requires validation, preserves parallel teams, then saves the reviewed draft', async () => {
    const imported = vi.fn();
    render(<AdminAiStudioImportModal open date="2026-10-29" onOpenChange={vi.fn()} onImported={imported} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Ручний ввід' }), { button: 0, ctrlKey: false });
    const input = screen.getByLabelText('Готовий JSON');
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
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Ручний ввід' }), { button: 0, ctrlKey: false });
    const input = screen.getByLabelText('Готовий JSON');
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