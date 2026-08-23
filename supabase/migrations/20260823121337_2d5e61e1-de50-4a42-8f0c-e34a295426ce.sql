REVOKE ALL ON FUNCTION public.purge_expired_fair_codes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_fair_open_now() FROM anon;