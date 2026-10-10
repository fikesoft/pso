-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" UUID NOT NULL,
    "loginNormalized" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "platformAdminId" UUID NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "mfaVerifiedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Chisinau',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "primaryAdminUserId" UUID,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Chisinau',
    "operationalDayStart" TEXT NOT NULL DEFAULT '04:00',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUser" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "loginNormalized" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "temporaryPasswordExpiresAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdByPlatformAdminId" UUID,
    "managedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLocationAccess" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLocationAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopeTypes" TEXT[],
    "delegable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "roleVersionId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "maxAmount" DECIMAL(18,2),
    "maxPercent" DECIMAL(5,2),

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleVersionId" UUID NOT NULL,
    "scopeType" TEXT NOT NULL,
    "locationId" UUID,
    "issuedByUserId" UUID NOT NULL,
    "delegationGrantId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "locationId" UUID,
    "maxAmount" DECIMAL(18,2),
    "maxPercent" DECIMAL(5,2),
    "issuedByUserId" UUID NOT NULL,
    "delegationGrantId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationGrant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "scopeType" TEXT NOT NULL,
    "locationId" UUID,
    "parentGrantId" UUID,
    "canRedelegate" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DelegationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationGrantPermission" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "delegationGrantId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "maxAmount" DECIMAL(18,2),
    "maxPercent" DECIMAL(5,2),

    CONSTRAINT "DelegationGrantPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "mfaVerifiedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaCredential" (
    "id" UUID NOT NULL,
    "principalType" TEXT NOT NULL,
    "organizationId" UUID,
    "userId" UUID,
    "platformAdminId" UUID,
    "encryptedSecret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastUsedStep" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MfaCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "mfaCredentialId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "locationId" UUID,
    "actorUserId" UUID,
    "actorPlatformAdminId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "outcome" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_loginNormalized_key" ON "PlatformAdmin"("loginNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformSession_platformAdminId_idx" ON "PlatformSession"("platformAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_id_key" ON "Location"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_code_key" ON "Location"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_organizationId_id_key" ON "CompanyUser"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_organizationId_loginNormalized_key" ON "CompanyUser"("organizationId", "loginNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "UserLocationAccess_organizationId_userId_locationId_key" ON "UserLocationAccess"("organizationId", "userId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RoleVersion_organizationId_id_key" ON "RoleVersion"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RoleVersion_organizationId_roleId_version_key" ON "RoleVersion"("organizationId", "roleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_organizationId_roleVersionId_permissionKey_key" ON "RolePermission"("organizationId", "roleVersionId", "permissionKey");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_organizationId_userId_idx" ON "UserRoleAssignment"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_organizationId_userId_idx" ON "UserPermissionOverride"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "DelegationGrant_organizationId_userId_idx" ON "DelegationGrant"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegationGrant_organizationId_id_key" ON "DelegationGrant"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DelegationGrantPermission_organizationId_delegationGrantId__key" ON "DelegationGrantPermission"("organizationId", "delegationGrantId", "permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSession_tokenHash_key" ON "TenantSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantSession_organizationId_userId_idx" ON "TenantSession"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MfaCredential_organizationId_id_key" ON "MfaCredential"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_locationId_createdAt_idx" ON "AuditEvent"("organizationId", "locationId", "createdAt");

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
-- Platform-owned permission catalog, synchronized with packages/authz/src/catalog.ts
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
('organization.read','Vizualizarea companiei',ARRAY['ORGANIZATION']::text[],true),
('locations.read','Vizualizarea locațiilor',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('locations.manage','Administrarea locațiilor',ARRAY['ORGANIZATION']::text[],true),
('staff.read','Vizualizarea personalului',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('staff.create','Crearea conturilor de personal',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('staff.manage','Modificarea și dezactivarea personalului',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('staff.credentials.reset','Resetarea parolelor subordonaților',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('staff.access','Administrarea accesului personalului',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('staff.delegate','Stabilirea plafoanelor de delegare',ARRAY['ORGANIZATION']::text[],false),
('roles.read','Vizualizarea rolurilor',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('roles.manage','Crearea versiunilor de rol',ARRAY['ORGANIZATION']::text[],true),
('audit.read','Vizualizarea jurnalului de audit',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('orders.read','Vizualizarea comenzilor',ARRAY['LOCATION']::text[],true),
('orders.create','Crearea comenzilor',ARRAY['LOCATION']::text[],true),
('kitchen.read','Vizualizarea bucătăriei',ARRAY['LOCATION']::text[],true),
('kitchen.update','Actualizarea preparării',ARRAY['LOCATION']::text[],true),
('catalog.read','Vizualizarea catalogului',ARRAY['LOCATION']::text[],true),
('catalog.manage','Administrarea catalogului',ARRAY['LOCATION']::text[],true),
('payments.collect','Înregistrarea încasărilor',ARRAY['LOCATION']::text[],true),
('payments.refund','Rambursarea plăților',ARRAY['LOCATION']::text[],true),
('reports.sales.read','Vizualizarea rapoartelor de vânzări',ARRAY['ORGANIZATION', 'LOCATION']::text[],true),
('reports.cost.read','Vizualizarea costurilor',ARRAY['ORGANIZATION', 'LOCATION']::text[],true);
