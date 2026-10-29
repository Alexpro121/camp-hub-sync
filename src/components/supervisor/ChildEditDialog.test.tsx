import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Child } from '@/types/app';

const mocks = vi.hoisted(() => ({ write: vi.fn(), balance: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/offline', () => ({ queuedWrite: mocks.write, queuedIronDollarChange: mocks.balance }));
vi.mock('@/context/DynamicIslandContext', () => ({ useDynamicIsland: () => ({ showSuccess: mocks.success }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import ChildEditDialog from './ChildEditDialog';

const child: Child = { id: 'child-1', shift_id: 'shift-1', full_name: 'Тестова дитина', team_number: 4,
  row_number: 1, phone: '0671112233', telegram_username: null, supervisor_notes: 'Здали ліки', gender: 'girl',
  notes_origin: 'registry', team_name: null, note_from_table: null, is_present: true, has_logged_in: false,
  iron_dollars: 10, raw_data: null, created_at: '2026-10-29', updated_at: '2026-10-29T10:00:00Z' };
beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue({ queued: false }); mocks.balance.mockResolvedValue({ queued: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const open = (row = child) => { const close = vi.fn(); return { close, ...render(<ChildEditDialog child={row} open onClose={close} />) }; };

describe('child profile saving', () => {
  it('does not write merely by opening the record', async () => {
    vi.useFakeTimers(); open();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('flushes a pending phone change on close without overwriting the registration note', async () => {
    const { close } = open();
    fireEvent.change(screen.getByLabelText('Номер телефону'), { target: { value: '0992223344' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.write.mock.calls[0][0].values).toEqual({ phone: '0992223344' });
  });
  it('retains the record on a permanent balance failure and never announces success', async () => {
    mocks.balance.mockResolvedValue({ queued: false, error: { message: 'forbidden' } });
    const { close } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти й закрити' }));
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Айрон-долари')).toHaveValue(11);
  });
  it('treats an accepted offline write as saved locally even with a network error', async () => {
    mocks.write.mockResolvedValue({ queued: true, error: new Error('network') });
    const { close } = open();
    fireEvent.change(screen.getByLabelText('Telegram'), { target: { value: '@test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it('rejects fractional balances instead of silently truncating them', async () => {
    const { close } = open();
    fireEvent.change(screen.getByLabelText('Айрон-долари'), { target: { value: '10.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти й закрити' }));
    await screen.findByRole('alert');
    expect(mocks.balance).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
  it('preserves dirty phone while refreshing untouched notes and server balance', async () => {
    const { rerender, close } = open();
    fireEvent.change(screen.getByLabelText('Номер телефону'), { target: { value: '0992223344' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
    rerender(<ChildEditDialog child={{ ...child, supervisor_notes: 'Нова нотатка', iron_dollars: 15, updated_at: '2026-10-29T11:00:00Z' }} open onClose={close} />);
    expect(screen.getByLabelText('Номер телефону')).toHaveValue('0992223344');
    expect(screen.getByLabelText(/Замітки/)).toHaveValue('Нова нотатка');
    expect(screen.getByLabelText('Айрон-долари')).toHaveValue(16);
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(mocks.balance.mock.calls[0][0].amount).toBe(1);
  });
  it('keeps edits visible when profile saving fails', async () => {
    mocks.write.mockRejectedValue(new Error('failed'));
    const { close } = open();
    fireEvent.change(screen.getByLabelText('Telegram'), { target: { value: '@draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Telegram')).toHaveValue('@draft');
  });
});