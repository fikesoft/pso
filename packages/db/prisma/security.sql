-- Hand-written constraints and privileges. Appended to the generated migration.
-- Object owner: pos_migrator. pos_internal is a NOLOGIN definer identity with
-- only identity/provisioning privileges, not a universal table owner or BYPASSRLS.
CREATE SCHEMA pos_auth AUTHORIZATION pos_migrator;
CREATE SCHEMA pos_control AUTHORIZATION pos_migrator;
REVOKE ALL ON SCHEMA pos_auth, pos_control FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_runtime,pos_auth,pos_platform,pos_internal;
GRANT USAGE ON SCHEMA pos_auth TO pos_auth,pos_internal;
GRANT USAGE ON SCHEMA pos_control TO pos_platform,pos_internal;
GRANT CREATE ON SCHEMA pos_auth,pos_control TO pos_internal;

ALTER TABLE "Organization" ADD CONSTRAINT org_state CHECK (status IN ('DRAFT','ACTIVE','DISABLED')),
  ADD CONSTRAINT org_active_primary CHECK (status <> 'ACTIVE' OR "primaryAdminUserId" IS NOT NULL),
  ADD CONSTRAINT org_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 63),
  ADD CONSTRAINT org_mdl CHECK(currency='MDL'),
  ADD CONSTRAINT org_primary_fk FOREIGN KEY (id,"primaryAdminUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT;
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT platform_state CHECK (status IN ('ACTIVE','DISABLED')),
  ADD CONSTRAINT platform_mfa CHECK("mfaRequired"),
  ADD CONSTRAINT platform_login CHECK ("loginNormalized"=lower(btrim("loginNormalized")) AND length("loginNormalized")>=3);
ALTER TABLE "PlatformSession" ADD CONSTRAINT platform_session_admin_fk FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT platform_token_hash CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT platform_session_expiry CHECK("idleExpiresAt" <= "expiresAt");
ALTER TABLE "CompanyUser" ADD CONSTRAINT user_org_fk FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT user_created_by_fk FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT user_manager_fk FOREIGN KEY ("organizationId","managedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT user_platform_creator_fk FOREIGN KEY ("createdByPlatformAdminId") REFERENCES "PlatformAdmin"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT user_creator CHECK (num_nonnulls("createdByUserId","createdByPlatformAdminId")=1),
  ADD CONSTRAINT user_not_self_managed CHECK (id<>"managedByUserId"),
  ADD CONSTRAINT user_primary_mfa CHECK (NOT "isPrimaryAdmin" OR "mfaRequired"),
  ADD CONSTRAINT user_state CHECK (status IN ('ACTIVE','DISABLED')),
  ADD CONSTRAINT user_login CHECK ("loginNormalized"=lower(btrim("loginNormalized")) AND length("loginNormalized")>=3);
CREATE UNIQUE INDEX one_primary_per_org ON "CompanyUser"("organizationId") WHERE "isPrimaryAdmin";
ALTER TABLE "Location" ADD CONSTRAINT location_org_fk FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT location_state CHECK (status IN ('ACTIVE','DISABLED')),
  ADD CONSTRAINT location_day_start CHECK ("operationalDayStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "UserLocationAccess" ADD CONSTRAINT ula_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT ula_location_fk FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX one_default_location ON "UserLocationAccess"("organizationId","userId") WHERE "isDefault";
ALTER TABLE "Permission" ADD CONSTRAINT permission_scope CHECK (cardinality("scopeTypes")>0 AND "scopeTypes" <@ ARRAY['ORGANIZATION','LOCATION']::text[]);
ALTER TABLE "Role" ADD CONSTRAINT role_org_fk FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_creator_fk FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_state CHECK(status IN ('ACTIVE','DISABLED'));
ALTER TABLE "RoleVersion" ADD CONSTRAINT role_version_role_fk FOREIGN KEY ("organizationId","roleId") REFERENCES "Role"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_version_creator_fk FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_version_positive CHECK(version>0);
ALTER TABLE "RolePermission" ADD CONSTRAINT role_permission_version_fk FOREIGN KEY ("organizationId","roleVersionId") REFERENCES "RoleVersion"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_permission_catalog_fk FOREIGN KEY ("permissionKey") REFERENCES "Permission"(key) ON DELETE RESTRICT,
  ADD CONSTRAINT role_permission_amount CHECK("maxAmount">=0), ADD CONSTRAINT role_permission_percent CHECK("maxPercent" BETWEEN 0 AND 100);
ALTER TABLE "DelegationGrant" ADD CONSTRAINT delegation_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_issuer_fk FOREIGN KEY ("organizationId","issuedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_location_fk FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_parent_fk FOREIGN KEY ("organizationId","parentGrantId") REFERENCES "DelegationGrant"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_scope CHECK (("scopeType"='ORGANIZATION' AND "locationId" IS NULL) OR ("scopeType"='LOCATION' AND "locationId" IS NOT NULL)),
  ADD CONSTRAINT delegation_no_redelegation CHECK(NOT "canRedelegate" AND "parentGrantId" IS NULL),
  ADD CONSTRAINT delegation_not_self CHECK("userId"<>"issuedByUserId"),
  ADD CONSTRAINT delegation_state CHECK ((status='ACTIVE' AND "revokedAt" IS NULL) OR (status='REVOKED' AND "revokedAt" IS NOT NULL));
CREATE UNIQUE INDEX delegation_org_active ON "DelegationGrant"("organizationId","userId","issuedByUserId") WHERE "scopeType"='ORGANIZATION' AND status='ACTIVE';
CREATE UNIQUE INDEX delegation_location_active ON "DelegationGrant"("organizationId","userId","issuedByUserId","locationId") WHERE "scopeType"='LOCATION' AND status='ACTIVE';
ALTER TABLE "DelegationGrantPermission" ADD CONSTRAINT delegation_permission_grant_fk FOREIGN KEY ("organizationId","delegationGrantId") REFERENCES "DelegationGrant"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_permission_catalog_fk FOREIGN KEY ("permissionKey") REFERENCES "Permission"(key) ON DELETE RESTRICT,
  ADD CONSTRAINT delegation_permission_amount CHECK("maxAmount">=0), ADD CONSTRAINT delegation_permission_percent CHECK("maxPercent" BETWEEN 0 AND 100);
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT assignment_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_role_fk FOREIGN KEY ("organizationId","roleVersionId") REFERENCES "RoleVersion"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_issuer_fk FOREIGN KEY ("organizationId","issuedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_location_fk FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_delegation_fk FOREIGN KEY ("organizationId","delegationGrantId") REFERENCES "DelegationGrant"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_scope CHECK (("scopeType"='ORGANIZATION' AND "locationId" IS NULL) OR ("scopeType"='LOCATION' AND "locationId" IS NOT NULL));
CREATE UNIQUE INDEX assignment_org_active ON "UserRoleAssignment"("organizationId","userId","roleVersionId") WHERE "scopeType"='ORGANIZATION' AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX assignment_location_active ON "UserRoleAssignment"("organizationId","userId","roleVersionId","locationId") WHERE "scopeType"='LOCATION' AND "revokedAt" IS NULL;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT override_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT override_catalog_fk FOREIGN KEY ("permissionKey") REFERENCES "Permission"(key) ON DELETE RESTRICT,
  ADD CONSTRAINT override_issuer_fk FOREIGN KEY ("organizationId","issuedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT override_location_fk FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT override_delegation_fk FOREIGN KEY ("organizationId","delegationGrantId") REFERENCES "DelegationGrant"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT override_scope CHECK (("scopeType"='ORGANIZATION' AND "locationId" IS NULL) OR ("scopeType"='LOCATION' AND "locationId" IS NOT NULL)),
  ADD CONSTRAINT override_effect CHECK(effect IN ('ALLOW','DENY')),
  ADD CONSTRAINT override_amount CHECK("maxAmount">=0), ADD CONSTRAINT override_percent CHECK("maxPercent" BETWEEN 0 AND 100);
CREATE UNIQUE INDEX override_org_active ON "UserPermissionOverride"("organizationId","userId","permissionKey",effect) WHERE "scopeType"='ORGANIZATION' AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX override_location_active ON "UserPermissionOverride"("organizationId","userId","permissionKey",effect,"locationId") WHERE "scopeType"='LOCATION' AND "revokedAt" IS NULL;
ALTER TABLE "TenantSession" ADD CONSTRAINT tenant_session_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_token_hash CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT tenant_session_expiry CHECK("idleExpiresAt" <= "expiresAt");
ALTER TABLE "MfaCredential" ADD CONSTRAINT mfa_user_fk FOREIGN KEY ("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT mfa_platform_fk FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mfa_principal CHECK (("principalType"='TENANT' AND "organizationId" IS NOT NULL AND "userId" IS NOT NULL AND "platformAdminId" IS NULL) OR ("principalType"='PLATFORM' AND "organizationId" IS NULL AND "userId" IS NULL AND "platformAdminId" IS NOT NULL)),
  ADD CONSTRAINT mfa_state CHECK(status IN ('PENDING','ACTIVE','DISABLED'));
CREATE UNIQUE INDEX mfa_tenant_current ON "MfaCredential"("organizationId","userId") WHERE status IN ('PENDING','ACTIVE');
CREATE UNIQUE INDEX mfa_platform_current ON "MfaCredential"("platformAdminId") WHERE status IN ('PENDING','ACTIVE');
ALTER TABLE "RecoveryCode" ADD CONSTRAINT recovery_mfa_fk FOREIGN KEY ("mfaCredentialId") REFERENCES "MfaCredential"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT recovery_tenant_mfa_fk FOREIGN KEY ("organizationId","mfaCredentialId") REFERENCES "MfaCredential"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT recovery_hash CHECK("codeHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_org_fk FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_location_fk FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_user_fk FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_platform_fk FOREIGN KEY ("actorPlatformAdminId") REFERENCES "PlatformAdmin"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT audit_one_actor CHECK (num_nonnulls("actorUserId","actorPlatformAdminId")<=1),
  ADD CONSTRAINT audit_tenant_actor CHECK("actorUserId" IS NULL OR "organizationId" IS NOT NULL),
  ADD CONSTRAINT audit_location_tenant CHECK("locationId" IS NULL OR "organizationId" IS NOT NULL),
  ADD CONSTRAINT audit_outcome CHECK(outcome IN ('SUCCESS','DENIED','FAILURE'));

CREATE FUNCTION public.reject_immutable_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'immutable record: append a new version' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_role_version BEFORE UPDATE OR DELETE ON "RoleVersion" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER immutable_role_permission BEFORE UPDATE OR DELETE ON "RolePermission" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER immutable_grant_permission BEFORE UPDATE OR DELETE ON "DelegationGrantPermission" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.check_permission_creation_transaction() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent_xmin xid;
BEGIN
  IF TG_TABLE_NAME='RolePermission' THEN
    SELECT xmin INTO parent_xmin FROM public."RoleVersion" WHERE id=NEW."roleVersionId" AND "organizationId"=NEW."organizationId";
  ELSE
    SELECT xmin INTO parent_xmin FROM public."DelegationGrant" WHERE id=NEW."delegationGrantId" AND "organizationId"=NEW."organizationId" AND status='ACTIVE';
  END IF;
  IF parent_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
    RAISE EXCEPTION 'permissions must be created with their immutable version/grant' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seal_role_permissions BEFORE INSERT ON "RolePermission" FOR EACH ROW EXECUTE FUNCTION public.check_permission_creation_transaction();
CREATE TRIGGER seal_delegation_permissions BEFORE INSERT ON "DelegationGrantPermission" FOR EACH ROW EXECUTE FUNCTION public.check_permission_creation_transaction();
CREATE FUNCTION public.protect_primary_admin() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_user NOT IN ('pos_internal','pos_migrator') THEN
    IF TG_OP='INSERT' AND NEW."isPrimaryAdmin" THEN
      RAISE EXCEPTION 'primary admin is provisioned privately' USING ERRCODE='42501';
    ELSIF TG_OP='UPDATE' THEN
      IF NEW."isPrimaryAdmin" IS DISTINCT FROM OLD."isPrimaryAdmin" OR (OLD."isPrimaryAdmin" AND NEW.status<>'ACTIVE') THEN
        RAISE EXCEPTION 'primary admin responsibility requires private transfer' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_primary_admin BEFORE INSERT OR UPDATE ON "CompanyUser" FOR EACH ROW EXECUTE FUNCTION public.protect_primary_admin();
CREATE FUNCTION public.check_recovery_principal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actual_org uuid;
BEGIN
 SELECT "organizationId" INTO actual_org FROM public."MfaCredential" WHERE id=NEW."mfaCredentialId";
 IF NOT FOUND OR actual_org IS DISTINCT FROM NEW."organizationId" THEN
   RAISE EXCEPTION 'recovery principal mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_principal BEFORE INSERT OR UPDATE ON "RecoveryCode" FOR EACH ROW EXECUTE FUNCTION public.check_recovery_principal();

-- RLS applies to every tenant table; USING and WITH CHECK fail closed without context.
DO $rls$
DECLARE table_name text; expression text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Organization','Location','CompanyUser','UserLocationAccess','Role','RoleVersion','RolePermission','UserRoleAssignment','UserPermissionOverride','DelegationGrant','DelegationGrantPermission','TenantSession','MfaCredential','RecoveryCode','AuditEvent'] LOOP
    expression := CASE WHEN table_name='Organization' THEN 'id' ELSE '"organizationId"' END || ' = nullif(current_setting(''app.organization_id'', true), '''')::uuid';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING (%s) WITH CHECK (%s)',table_name,expression,expression);
  END LOOP;
END $rls$;
GRANT SELECT ON "Permission" TO pos_runtime;
GRANT SELECT ON "Organization" TO pos_runtime;
GRANT UPDATE ("policyVersion",version,"updatedAt") ON "Organization" TO pos_runtime;
GRANT SELECT,INSERT,UPDATE ON "Location","CompanyUser","UserRoleAssignment","UserPermissionOverride","DelegationGrant","TenantSession","MfaCredential","RecoveryCode","Role" TO pos_runtime;
GRANT SELECT,INSERT,DELETE ON "UserLocationAccess" TO pos_runtime;
GRANT SELECT,INSERT ON "RoleVersion","RolePermission","DelegationGrantPermission","AuditEvent" TO pos_runtime;
GRANT SELECT,INSERT,UPDATE ON "PlatformAdmin","PlatformSession" TO pos_platform;
GRANT SELECT,INSERT,UPDATE ON "MfaCredential","RecoveryCode" TO pos_platform;
GRANT SELECT,INSERT ON "AuditEvent" TO pos_platform;
CREATE POLICY platform_mfa ON "MfaCredential" TO pos_platform USING ("principalType"='PLATFORM') WITH CHECK ("principalType"='PLATFORM');
CREATE POLICY platform_recovery ON "RecoveryCode" TO pos_platform USING ("organizationId" IS NULL) WITH CHECK ("organizationId" IS NULL);
CREATE POLICY platform_audit ON "AuditEvent" TO pos_platform USING ("organizationId" IS NULL) WITH CHECK ("organizationId" IS NULL AND "actorUserId" IS NULL);

-- Internal functions can see only the identity tables explicitly granted here.
GRANT SELECT,INSERT,UPDATE ON "Organization","CompanyUser" TO pos_internal;
GRANT SELECT ON "TenantSession","PlatformAdmin" TO pos_internal;
GRANT INSERT ON "AuditEvent" TO pos_internal;
CREATE POLICY internal_org ON "Organization" TO pos_internal USING (true) WITH CHECK (true);
CREATE POLICY internal_users ON "CompanyUser" TO pos_internal USING (true) WITH CHECK (true);
CREATE POLICY internal_sessions ON "TenantSession" TO pos_internal USING (true);
CREATE POLICY internal_audit ON "AuditEvent" TO pos_internal WITH CHECK (true);

CREATE FUNCTION pos_auth.lookup_tenant_login(company_slug text, login_normalized text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('user',to_jsonb(u),'organization',to_jsonb(o))
 FROM public."Organization" o JOIN public."CompanyUser" u ON u."organizationId"=o.id
 WHERE o.slug=company_slug AND u."loginNormalized"=login_normalized AND o.status='ACTIVE' AND u.status='ACTIVE'
 LIMIT 1
$$;
CREATE FUNCTION pos_auth.lookup_tenant_session(token_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('session',to_jsonb(s),'user',to_jsonb(u),'organization',to_jsonb(o))
 FROM public."TenantSession" s JOIN public."CompanyUser" u ON u.id=s."userId" AND u."organizationId"=s."organizationId"
 JOIN public."Organization" o ON o.id=s."organizationId"
 WHERE s."tokenHash"=token_hash AND s."revokedAt" IS NULL AND s."expiresAt">now() AND s."idleExpiresAt">now()
 AND u.status='ACTIVE' AND o.status='ACTIVE' AND s."authVersion"=u."authVersion"
 LIMIT 1
$$;
CREATE FUNCTION pos_control.provision_organization(company_slug text, company_name text, legal_name text,
 admin_login text, admin_display_name text, password_hash text, temporary_expires_at timestamptz, platform_admin_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE organization_id uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid(); org_row public."Organization"; user_row public."CompanyUser";
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."PlatformAdmin" WHERE id=platform_admin_id AND status='ACTIVE') THEN
   RAISE EXCEPTION 'active platform identity required' USING ERRCODE='42501';
 END IF;
 IF password_hash NOT LIKE '$argon2id$%' OR temporary_expires_at<=now() THEN
   RAISE EXCEPTION 'temporary credential is invalid' USING ERRCODE='23514';
 END IF;
 INSERT INTO public."Organization"(id,slug,name,"legalName","updatedAt") VALUES (organization_id,company_slug,company_name,legal_name,now());
 INSERT INTO public."CompanyUser"(id,"organizationId","loginNormalized","displayName","passwordHash","temporaryPasswordExpiresAt","isPrimaryAdmin","mfaRequired","createdByPlatformAdminId","updatedAt")
 VALUES(user_id,organization_id,admin_login,admin_display_name,password_hash,temporary_expires_at,true,true,platform_admin_id,now()) RETURNING * INTO user_row;
 UPDATE public."Organization" SET "primaryAdminUserId"=user_id,status='ACTIVE',"updatedAt"=now() WHERE id=organization_id RETURNING * INTO org_row;
 INSERT INTO public."AuditEvent"(id,"organizationId","actorPlatformAdminId",action,"targetType","targetId",outcome,"requestId")
 VALUES(gen_random_uuid(),organization_id,platform_admin_id,'organization.provision','Organization',organization_id::text,'SUCCESS',gen_random_uuid()::text);
 RETURN jsonb_build_object('organization',to_jsonb(org_row),'user',to_jsonb(user_row)-'passwordHash');
END $$;
CREATE FUNCTION pos_control.list_organizations() RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',id,'slug',slug,'name',name,'legalName',"legalName",'status',status,'createdAt',"createdAt")
 FROM public."Organization" ORDER BY "createdAt" DESC LIMIT 200
$$;
ALTER FUNCTION pos_auth.lookup_tenant_login(text,text) OWNER TO pos_internal;
ALTER FUNCTION pos_auth.lookup_tenant_session(text) OWNER TO pos_internal;
ALTER FUNCTION pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid) OWNER TO pos_internal;
ALTER FUNCTION pos_control.list_organizations() OWNER TO pos_internal;
REVOKE CREATE ON SCHEMA pos_auth,pos_control FROM pos_internal;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pos_auth,pos_control FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_immutable_mutation(),public.check_permission_creation_transaction(),public.protect_primary_admin(),public.check_recovery_principal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_auth.lookup_tenant_login(text,text),pos_auth.lookup_tenant_session(text) TO pos_auth;
GRANT EXECUTE ON FUNCTION pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid),pos_control.list_organizations() TO pos_platform;

CREATE FUNCTION public.protect_grant_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='DelegationGrant' THEN
   IF OLD.status<>'ACTIVE' OR NEW.status<>'REVOKED' OR NEW."revokedAt" IS NULL
      OR (to_jsonb(NEW)-ARRAY['status','revokedAt','reason','version','updatedAt']) IS DISTINCT FROM
         (to_jsonb(OLD)-ARRAY['status','revokedAt','reason','version','updatedAt']) THEN
     RAISE EXCEPTION 'delegation grants are immutable except revocation' USING ERRCODE='23514';
   END IF;
 ELSE
   IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
      OR (to_jsonb(NEW)-'revokedAt') IS DISTINCT FROM (to_jsonb(OLD)-'revokedAt') THEN
     RAISE EXCEPTION 'access records are immutable except revocation' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grant_history BEFORE UPDATE ON "DelegationGrant" FOR EACH ROW EXECUTE FUNCTION public.protect_grant_history();
CREATE TRIGGER assignment_history BEFORE UPDATE ON "UserRoleAssignment" FOR EACH ROW EXECUTE FUNCTION public.protect_grant_history();
CREATE TRIGGER override_history BEFORE UPDATE ON "UserPermissionOverride" FOR EACH ROW EXECUTE FUNCTION public.protect_grant_history();
REVOKE ALL ON FUNCTION public.protect_grant_history() FROM PUBLIC;
