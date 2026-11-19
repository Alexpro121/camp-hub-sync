-- Тимчасовий демо-режим /swap: адмін зі списку TELEGRAM_ADMIN_IDS переглядає застосунок від імені іншої ролі.
-- Доступ лише серверним функціям. Щоб прибрати режим повністю: DROP TABLE public.telegram_role_swaps;
CREATE TABLE public.telegram_role_swaps (
  tg_user_id bigint PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('child', 'supervisor', 'duckling', 'doctor')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.telegram_role_swaps FROM anon, authenticated;
GRANT ALL ON public.telegram_role_swaps TO service_role;
ALTER TABLE public.telegram_role_swaps ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.telegram_role_swaps IS 'Temporary /swap demo mode for env admins; accessed only by server functions.';
