CREATE TABLE public.login_attempts (
  id bigserial PRIMARY KEY,
  scope text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
GRANT ALL ON public.login_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.login_attempts_id_seq TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX login_attempts_scope_key_time ON public.login_attempts (scope, key, created_at DESC);
COMMENT ON TABLE public.login_attempts IS 'Failed login attempts for rate limiting; accessed only by server functions.';