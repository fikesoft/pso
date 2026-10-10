BEGIN;
-- Schema USAGE only resolves the shared throttling helper. Function ACLs still
-- keep tenant identity lookups private to pos_auth.
GRANT USAGE ON SCHEMA pos_auth TO pos_platform;
DO $$
BEGIN
  IF NOT has_function_privilege('pos_platform',
      'pos_auth.consume_auth_rate_limit(text,integer,integer)'::regprocedure,'EXECUTE')
    OR has_function_privilege('pos_platform',
      'pos_auth.lookup_tenant_login(text,text)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'platform auth helper ACL invariant failed';
  END IF;
END $$;
COMMIT;
