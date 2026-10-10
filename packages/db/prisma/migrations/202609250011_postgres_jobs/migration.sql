-- PostgreSQL durable queue: no Redis, network calls or business consumers implied.
CREATE SCHEMA pos_jobs;
REVOKE ALL ON SCHEMA pos_jobs FROM PUBLIC;
GRANT USAGE ON SCHEMA pos_jobs TO pos_runtime,pos_worker,pos_internal;
GRANT CREATE ON SCHEMA pos_jobs TO pos_internal;

CREATE TABLE public."BackgroundJob" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES public."Organization"(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.]{0,99}$'),
  "idempotencyKey" text NOT NULL CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','DEAD')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  "maxAttempts" integer NOT NULL DEFAULT 5 CHECK ("maxAttempts" BETWEEN 1 AND 10),
  "availableAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "leaseUntil" timestamptz,
  "leaseToken" uuid,
  "workerId" uuid,
  "lastErrorCode" text CHECK ("lastErrorCode" ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  result jsonb CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=65536),
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updatedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "finishedAt" timestamptz,
  UNIQUE ("organizationId","idempotencyKey"),
  UNIQUE ("organizationId",id),
  CHECK (attempts<="maxAttempts"),
  CHECK ((status='RUNNING')=("leaseUntil" IS NOT NULL AND "leaseToken" IS NOT NULL AND "workerId" IS NOT NULL)),
  CHECK (status='RUNNING' OR ("leaseUntil" IS NULL AND "leaseToken" IS NULL AND "workerId" IS NULL)),
  CHECK ((status IN ('COMPLETED','DEAD'))=("finishedAt" IS NOT NULL))
);
CREATE INDEX jobs_pending ON public."BackgroundJob"("availableAt",id) WHERE status='PENDING';
CREATE INDEX jobs_expired ON public."BackgroundJob"("leaseUntil",id) WHERE status='RUNNING';
ALTER TABLE public."BackgroundJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BackgroundJob" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."BackgroundJob" FROM PUBLIC,pos_runtime,pos_worker,pos_auth,pos_platform,pos_internal;
GRANT SELECT ON public."BackgroundJob" TO pos_runtime;
GRANT SELECT,INSERT,UPDATE ON public."BackgroundJob" TO pos_internal;
CREATE POLICY jobs_tenant ON public."BackgroundJob" TO pos_runtime
  USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY jobs_internal ON public."BackgroundJob" TO pos_internal USING (true) WITH CHECK (true);

CREATE FUNCTION pos_jobs.enqueue(organization_id uuid, job_kind text, idempotency_key text,
  job_payload jsonb, max_attempts integer DEFAULT 5, scheduled_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved public."BackgroundJob"; request_hash text;
BEGIN
  IF organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
    OR organization_id IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE='42501';
  END IF;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('kind',job_kind,'payload',job_payload,
    'maxAttempts',max_attempts,'scheduledAt',scheduled_at)::text,'UTF8')),'hex');
  INSERT INTO public."BackgroundJob"("organizationId",kind,"idempotencyKey","requestHash",payload,"maxAttempts","availableAt")
    VALUES(organization_id,job_kind,idempotency_key,request_hash,job_payload,max_attempts,coalesce(scheduled_at,clock_timestamp()))
    ON CONFLICT ("organizationId","idempotencyKey") DO NOTHING RETURNING * INTO saved;
  IF saved.id IS NULL THEN
    SELECT * INTO saved FROM public."BackgroundJob" WHERE "organizationId"=organization_id AND "idempotencyKey"=idempotency_key;
    IF saved."requestHash" IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'idempotency payload conflict' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN to_jsonb(saved)-ARRAY['leaseToken','workerId'];
END $$;

-- Discovery only claims a bounded batch; caller cannot select an arbitrary tenant payload.
CREATE FUNCTION pos_jobs.claim(worker_id uuid, batch_size integer DEFAULT 1, lease_seconds integer DEFAULT 30)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF worker_id IS NULL OR batch_size NOT BETWEEN 1 AND 20 OR lease_seconds NOT BETWEEN 1 AND 300
    OR batch_size IS NULL OR lease_seconds IS NULL THEN
    RAISE EXCEPTION 'invalid claim bounds' USING ERRCODE='22023';
  END IF;
  -- Exhausted crashed jobs become dead letters; bounded recovery avoids a global queue lock.
  WITH expired AS (
    SELECT id FROM public."BackgroundJob" WHERE status='RUNNING' AND "leaseUntil"<=clock_timestamp()
      AND attempts>="maxAttempts" ORDER BY "leaseUntil",id FOR UPDATE SKIP LOCKED LIMIT 20
  ) UPDATE public."BackgroundJob" j SET status='DEAD',"leaseUntil"=NULL,"leaseToken"=NULL,"workerId"=NULL,
    "lastErrorCode"='LEASE_EXPIRED',"finishedAt"=clock_timestamp(),"updatedAt"=clock_timestamp()
    FROM expired e WHERE j.id=e.id;
  RETURN QUERY WITH candidates AS (
    SELECT id FROM public."BackgroundJob"
    WHERE (status='PENDING' AND "availableAt"<=clock_timestamp())
      OR (status='RUNNING' AND "leaseUntil"<=clock_timestamp() AND attempts<"maxAttempts")
    ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT batch_size
  ), claimed AS (
    UPDATE public."BackgroundJob" j SET status='RUNNING',attempts=j.attempts+1,
      "leaseUntil"=clock_timestamp()+make_interval(secs=>lease_seconds),"leaseToken"=gen_random_uuid(),
      "workerId"=worker_id,"updatedAt"=clock_timestamp()
    FROM candidates c WHERE j.id=c.id RETURNING j.*
  ) SELECT to_jsonb(claimed) FROM claimed;
END $$;

CREATE FUNCTION pos_jobs.complete(organization_id uuid, job_id uuid, lease_token uuid, job_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
  IF organization_id IS NULL OR organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE='42501';
  END IF;
  UPDATE public."BackgroundJob" SET status='COMPLETED',result=job_result,"leaseUntil"=NULL,"leaseToken"=NULL,
    "workerId"=NULL,"finishedAt"=clock_timestamp(),"updatedAt"=clock_timestamp()
  WHERE id=job_id AND "organizationId"=organization_id AND status='RUNNING'
    AND "leaseToken"=lease_token AND "leaseUntil">clock_timestamp();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END $$;

CREATE FUNCTION pos_jobs.fail(organization_id uuid, job_id uuid, lease_token uuid, error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
  IF organization_id IS NULL OR organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE='42501';
  END IF;
  IF error_code IS NULL OR error_code !~ '^[A-Z][A-Z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'sanitized error code required' USING ERRCODE='22023';
  END IF;
  UPDATE public."BackgroundJob" SET status=CASE WHEN attempts>="maxAttempts" THEN 'DEAD' ELSE 'PENDING' END,
    "availableAt"=clock_timestamp()+make_interval(secs=>least(300,power(2,attempts-1)::integer)),
    "lastErrorCode"=error_code,"leaseUntil"=NULL,"leaseToken"=NULL,"workerId"=NULL,
    "finishedAt"=CASE WHEN attempts>="maxAttempts" THEN clock_timestamp() ELSE NULL END,"updatedAt"=clock_timestamp()
  WHERE id=job_id AND "organizationId"=organization_id AND status='RUNNING'
    AND "leaseToken"=lease_token AND "leaseUntil">clock_timestamp();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END $$;

ALTER FUNCTION pos_jobs.enqueue(uuid,text,text,jsonb,integer,timestamptz) OWNER TO pos_internal;
ALTER FUNCTION pos_jobs.claim(uuid,integer,integer) OWNER TO pos_internal;
ALTER FUNCTION pos_jobs.complete(uuid,uuid,uuid,jsonb) OWNER TO pos_internal;
ALTER FUNCTION pos_jobs.fail(uuid,uuid,uuid,text) OWNER TO pos_internal;
REVOKE CREATE ON SCHEMA pos_jobs FROM pos_internal;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pos_jobs FROM PUBLIC,pos_runtime,pos_worker,pos_auth,pos_platform;
GRANT EXECUTE ON FUNCTION pos_jobs.enqueue(uuid,text,text,jsonb,integer,timestamptz) TO pos_runtime;
GRANT EXECUTE ON FUNCTION pos_jobs.claim(uuid,integer,integer),pos_jobs.complete(uuid,uuid,uuid,jsonb),pos_jobs.fail(uuid,uuid,uuid,text) TO pos_worker;
