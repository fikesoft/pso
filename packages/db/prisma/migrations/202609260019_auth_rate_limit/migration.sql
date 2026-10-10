BEGIN;

GRANT CREATE ON SCHEMA public,pos_auth TO pos_internal;

-- Keys are HMAC-SHA256 digests produced by the API. No login, IP, slug or
-- credential is sent to or stored in this table.
CREATE TABLE public."AuthRateLimitBucket" (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 1001),
  "expiresAt" timestamptz NOT NULL
);
CREATE INDEX auth_rate_limit_expiry ON public."AuthRateLimitBucket"("expiresAt");
REVOKE ALL ON public."AuthRateLimitBucket" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker;
ALTER TABLE public."AuthRateLimitBucket" OWNER TO pos_internal;

CREATE FUNCTION pos_auth.consume_auth_rate_limit(key_digest text, max_attempts integer, window_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  current_time timestamptz := clock_timestamp();
  bucket_attempts integer;
BEGIN
  IF key_digest IS NULL OR key_digest !~ '^[0-9a-f]{64}$'
    OR max_attempts IS NULL OR max_attempts NOT BETWEEN 1 AND 1000
    OR window_ms IS NULL OR window_ms NOT BETWEEN 1000 AND 3600000 THEN
    RAISE EXCEPTION 'invalid auth rate limit arguments' USING ERRCODE = '22023';
  END IF;

  -- The lock serializes capacity checks and updates across all API processes.
  PERFORM pg_advisory_xact_lock(460071, 1);
  DELETE FROM public."AuthRateLimitBucket" WHERE digest IN (
    SELECT digest FROM public."AuthRateLimitBucket"
    WHERE "expiresAt" <= current_time ORDER BY "expiresAt" LIMIT 1000
  );
  SELECT attempts INTO bucket_attempts
    FROM public."AuthRateLimitBucket" WHERE digest = key_digest;
  IF FOUND THEN
    bucket_attempts := least(bucket_attempts + 1, 1001);
    UPDATE public."AuthRateLimitBucket" SET attempts = bucket_attempts
      WHERE digest = key_digest;
  ELSE
    -- Bound storage and fail closed when live keys consume the capacity.
    IF (SELECT count(*) FROM public."AuthRateLimitBucket") >= 10000 THEN
      RETURN false;
    END IF;
    bucket_attempts := 1;
    INSERT INTO public."AuthRateLimitBucket"(digest,attempts,"expiresAt")
      VALUES(key_digest,1,current_time + window_ms * interval '1 millisecond');
  END IF;
  RETURN bucket_attempts <= max_attempts;
END $function$;
REVOKE ALL ON FUNCTION pos_auth.consume_auth_rate_limit(text,integer,integer)
  FROM PUBLIC,pos_runtime,pos_worker,pos_auth,pos_platform;
GRANT EXECUTE ON FUNCTION pos_auth.consume_auth_rate_limit(text,integer,integer)
  TO pos_auth,pos_platform;
ALTER FUNCTION pos_auth.consume_auth_rate_limit(text,integer,integer) OWNER TO pos_internal;

DO $$
DECLARE function_oid oid := 'pos_auth.consume_auth_rate_limit(text,integer,integer)'::regprocedure::oid;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid=function_oid AND (NOT p.prosecdef OR r.rolname<>'pos_internal'
      OR r.rolcanlogin OR r.rolsuper OR r.rolbypassrls))
    OR has_function_privilege('pos_runtime',function_oid,'EXECUTE')
    OR has_function_privilege('pos_worker',function_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'auth rate limit ACL invariant failed';
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public,pos_auth FROM pos_internal;

COMMIT;
