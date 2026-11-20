-- Один розклад може належати кільком паралельним змінам одразу.
-- shift_ids — аудиторія розкладу; shift_id лишається для старих клієнтів
-- (заповнений лише коли зміна одна). Обидва порожні = загальнотаборовий розклад.
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS shift_ids uuid[];

UPDATE public.schedules
SET shift_ids = ARRAY[shift_id]
WHERE shift_id IS NOT NULL AND shift_ids IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_shift_ids ON public.schedules USING gin (shift_ids);
