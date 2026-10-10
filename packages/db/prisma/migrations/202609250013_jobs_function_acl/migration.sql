-- pos_migrator is NOINHERIT. Function ACL changes after ownership transfer must
-- execute as the actual NOLOGIN owner; otherwise PostgreSQL only emits warnings.
BEGIN;
SET LOCAL ROLE pos_internal;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pos_jobs FROM PUBLIC,pos_runtime,pos_worker,pos_auth,pos_platform;
GRANT EXECUTE ON FUNCTION pos_jobs.enqueue(uuid,text,text,jsonb,integer,timestamptz) TO pos_runtime;
GRANT EXECUTE ON FUNCTION pos_jobs.claim(uuid,integer,integer),pos_jobs.complete(uuid,uuid,uuid,jsonb),pos_jobs.fail(uuid,uuid,uuid,text) TO pos_worker;
RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('pos_runtime','pos_jobs.claim(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('pos_runtime','pos_jobs.complete(uuid,uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('pos_auth','pos_jobs.enqueue(uuid,text,text,jsonb,integer,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('pos_worker','pos_jobs.claim(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'job function ACL invariant failed';
  END IF;
END $$;
COMMIT;
