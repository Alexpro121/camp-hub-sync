-- «Спортивна зміна» є в застосунку (SHIFT_LABELS, вибір типу), але перевірка в базі її не пускала:
-- створення чи редагування спортивної зміни в адмінці падало з порушенням shifts_shift_type_check.
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_shift_type_check
  CHECK (shift_type = ANY (ARRAY['long'::text, 'short'::text, 'international'::text, 'sports'::text]));
