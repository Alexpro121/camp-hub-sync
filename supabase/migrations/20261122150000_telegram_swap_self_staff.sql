-- /swap «Я (супровід)»: адмін, який водночас супровід, відкриває свою команду замість адмінки (роль 'me').
ALTER TABLE public.telegram_role_swaps DROP CONSTRAINT IF EXISTS telegram_role_swaps_role_check;
ALTER TABLE public.telegram_role_swaps ADD CONSTRAINT telegram_role_swaps_role_check
  CHECK (role = ANY (ARRAY['child'::text, 'supervisor'::text, 'duckling'::text, 'doctor'::text, 'me'::text]));
