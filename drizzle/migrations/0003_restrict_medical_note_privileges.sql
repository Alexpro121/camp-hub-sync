REVOKE ALL ON public.child_medical_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.child_medical_notes FROM authenticated;
GRANT SELECT ON public.child_medical_notes TO authenticated;
GRANT ALL ON public.child_medical_notes TO service_role;