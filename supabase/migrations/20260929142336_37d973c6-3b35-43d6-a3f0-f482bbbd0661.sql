REVOKE EXECUTE ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer, uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pay_fair_push_charge(uuid, integer, text, integer, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_fair_code(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_fair_open_now() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_coupe_swap(uuid) FROM anon, authenticated, PUBLIC;