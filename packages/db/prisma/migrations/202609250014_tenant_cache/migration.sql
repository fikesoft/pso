BEGIN;
-- Disposable server cache. Never the authority for sessions, permissions or financial data.
CREATE TABLE public."TenantCacheEntry" (
  "organizationId" uuid NOT NULL REFERENCES public."Organization"(id) ON DELETE RESTRICT,
  namespace text NOT NULL CHECK (namespace ~ '^[a-z][a-z0-9_.]{0,99}$'),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  value jsonb NOT NULL CHECK (jsonb_typeof(value)='object' AND octet_length(value::text)<=65536),
  "writtenAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  PRIMARY KEY ("organizationId",namespace,key),
  CHECK ("expiresAt">"writtenAt" AND "expiresAt"<="writtenAt"+interval '1 day')
);
CREATE INDEX tenant_cache_expiry ON public."TenantCacheEntry"("organizationId","expiresAt");
ALTER TABLE public."TenantCacheEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TenantCacheEntry" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."TenantCacheEntry" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."TenantCacheEntry" TO pos_runtime;
CREATE POLICY tenant_cache_scope ON public."TenantCacheEntry" TO pos_runtime
  USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
COMMIT;
