-- Worker PIN login is opt-in. Existing identities and sessions remain PASSWORD.
-- The lookup digest is keyed by the application; the PIN itself is never stored here.
BEGIN;

ALTER TABLE "CompanyUser"
  ADD COLUMN "authenticationMethod" text NOT NULL DEFAULT 'PASSWORD',
  ADD COLUMN "pinLookup" text,
  ADD COLUMN "pinHash" text,
  ADD CONSTRAINT user_authentication_method CHECK ("authenticationMethod" IN ('PASSWORD','PIN')),
  ADD CONSTRAINT user_pin_credentials CHECK (
    ("authenticationMethod"='PASSWORD' AND "pinLookup" IS NULL AND "pinHash" IS NULL)
    OR ("authenticationMethod"='PIN' AND "pinLookup" IS NOT NULL AND "pinHash" IS NOT NULL
      AND "pinLookup" ~ '^[a-f0-9]{64}$' AND "pinHash" LIKE '$argon2id$%')
  ),
  ADD CONSTRAINT user_pin_worker_only CHECK (
    "authenticationMethod"<>'PIN' OR (NOT "isPrimaryAdmin" AND NOT "mfaRequired" AND NOT "mustChangePassword")
  );
CREATE UNIQUE INDEX "CompanyUser_organizationId_pinLookup_key"
  ON "CompanyUser"("organizationId","pinLookup");

ALTER TABLE "TenantSession"
  ADD COLUMN "authenticationMethod" text NOT NULL DEFAULT 'PASSWORD',
  ADD CONSTRAINT tenant_session_authentication_method CHECK ("authenticationMethod" IN ('PASSWORD','PIN'));

CREATE FUNCTION pos_auth.lookup_tenant_pin(company_slug text, pin_lookup text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('user',to_jsonb(u),'organization',to_jsonb(o))
  FROM public."Organization" o JOIN public."CompanyUser" u ON u."organizationId"=o.id
  WHERE o.slug=company_slug AND u."pinLookup"=pin_lookup
    AND o.status='ACTIVE' AND u.status='ACTIVE' AND u."authenticationMethod"='PIN'
    AND NOT u."isPrimaryAdmin" AND NOT u."mfaRequired" AND NOT u."mustChangePassword"
  LIMIT 1
$$;

-- PostgreSQL requires the new function owner to have CREATE during ownership transfer.
-- This temporary grant and its revocation are atomic with the entire migration.
GRANT CREATE ON SCHEMA pos_auth TO pos_internal;
ALTER FUNCTION pos_auth.lookup_tenant_pin(text,text) OWNER TO pos_internal;
SET LOCAL ROLE pos_internal;
REVOKE ALL ON FUNCTION pos_auth.lookup_tenant_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_auth.lookup_tenant_pin(text,text) TO pos_auth;

CREATE OR REPLACE FUNCTION pos_auth.lookup_tenant_session(token_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('session',to_jsonb(s),'user',to_jsonb(u),'organization',to_jsonb(o))
  FROM public."TenantSession" s JOIN public."CompanyUser" u
    ON u.id=s."userId" AND u."organizationId"=s."organizationId"
  JOIN public."Organization" o ON o.id=s."organizationId"
  WHERE s."tokenHash"=token_hash AND s."revokedAt" IS NULL
    AND s."expiresAt">now() AND s."idleExpiresAt">now()
    AND u.status='ACTIVE' AND o.status='ACTIVE' AND s."authVersion"=u."authVersion"
    AND s."authenticationMethod"=u."authenticationMethod"
  LIMIT 1
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA pos_auth FROM pos_internal;
COMMIT;
