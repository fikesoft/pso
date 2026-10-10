BEGIN;
GRANT CREATE ON SCHEMA pos_auth TO pos_internal;
SET LOCAL ROLE pos_internal;
CREATE OR REPLACE FUNCTION pos_auth.consume_auth_rate_limit(key_digest text, max_attempts integer, window_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  now_at timestamptz := clock_timestamp();
  bucket_attempts integer;
BEGIN
  IF key_digest IS NULL OR key_digest !~ '^[0-9a-f]{64}$'
    OR max_attempts IS NULL OR max_attempts NOT BETWEEN 1 AND 1000
    OR window_ms IS NULL OR window_ms NOT BETWEEN 1000 AND 3600000 THEN
    RAISE EXCEPTION 'invalid auth rate limit arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(460071, 1);
  DELETE FROM public."AuthRateLimitBucket" WHERE digest IN (
    SELECT digest FROM public."AuthRateLimitBucket"
    WHERE "expiresAt" <= now_at ORDER BY "expiresAt" LIMIT 1000
  );
  SELECT attempts INTO bucket_attempts
    FROM public."AuthRateLimitBucket" WHERE digest = key_digest;
  IF FOUND THEN
    bucket_attempts := least(bucket_attempts + 1, 1001);
    UPDATE public."AuthRateLimitBucket" SET attempts = bucket_attempts
      WHERE digest = key_digest;
  ELSE
    IF (SELECT count(*) FROM public."AuthRateLimitBucket") >= 10000 THEN
      RETURN false;
    END IF;
    bucket_attempts := 1;
    INSERT INTO public."AuthRateLimitBucket"(digest,attempts,"expiresAt")
      VALUES(key_digest,1,now_at + window_ms * interval '1 millisecond');
  END IF;
  RETURN bucket_attempts <= max_attempts;
END $function$;
RESET ROLE;
REVOKE CREATE ON SCHEMA pos_auth FROM pos_internal;
COMMIT;
