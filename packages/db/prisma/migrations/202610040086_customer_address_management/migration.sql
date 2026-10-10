BEGIN;
-- Historical contact ciphertext, snapshots and creation/archive identities remain unchanged.
LOCK TABLE "Customer", "CustomerAddress" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "CustomerAddress" DROP CONSTRAINT customer_address_archive_shape;
DROP TRIGGER customer_address_history ON "CustomerAddress";
DROP TRIGGER customer_address_active_parent ON "CustomerAddress";
ALTER TABLE "CustomerAddress"
 ADD COLUMN "updatedAt" timestamptz(3), ADD COLUMN "updatedByUserId" uuid,
 ADD COLUMN "updatedLocationId" uuid, ADD COLUMN "lastCommandId" uuid;
DO $$ BEGIN
 EXECUTE format('CREATE POLICY address_management_backfill ON "CustomerAddress" TO %I USING (true) WITH CHECK (true)',current_user);
 EXECUTE format('CREATE POLICY address_preference_backfill ON "Customer" TO %I USING (true)',current_user);
END $$;
UPDATE "CustomerAddress" SET "updatedAt"=coalesce("archivedAt","createdAt"),
 "updatedByUserId"=coalesce("archivedByUserId","createdByUserId"),
 "updatedLocationId"=coalesce("archivedLocationId","createdLocationId");
DROP POLICY address_management_backfill ON "CustomerAddress";
ALTER TABLE "CustomerAddress"
 ALTER COLUMN "updatedAt" SET NOT NULL, ALTER COLUMN "updatedByUserId" SET NOT NULL,
 ALTER COLUMN "updatedLocationId" SET NOT NULL,
 ADD FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 ADD FOREIGN KEY("organizationId","updatedLocationId") REFERENCES "Location"("organizationId",id),
 ADD CONSTRAINT customer_address_archive_shape CHECK(version>0 AND (
  (status='ACTIVE' AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL AND "archivedLocationId" IS NULL AND "archiveRequestKey" IS NULL AND "archiveRequestHash" IS NULL)
  OR (status='ARCHIVED' AND version>=2 AND "archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL AND "archivedLocationId" IS NOT NULL AND "archiveRequestKey" IS NOT NULL AND "archiveRequestHash" IS NOT NULL AND "archiveRequestHash" ~ '^[0-9a-f]{64}$')));

CREATE TABLE "CustomerAddressPreference" (
 "customerId" uuid PRIMARY KEY, "organizationId" uuid NOT NULL,
 "defaultAddressId" uuid, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 "updatedAt" timestamptz(3) NOT NULL, "updatedByUserId" uuid NOT NULL,
 "updatedLocationId" uuid NOT NULL, "lastCommandId" uuid,
 UNIQUE("organizationId","customerId"),
 FOREIGN KEY("organizationId","customerId") REFERENCES "Customer"("organizationId",id),
 FOREIGN KEY("organizationId","customerId","defaultAddressId") REFERENCES "CustomerAddress"("organizationId","customerId",id),
 FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","updatedLocationId") REFERENCES "Location"("organizationId",id)
);
INSERT INTO "CustomerAddressPreference"("organizationId","customerId","updatedAt","updatedByUserId","updatedLocationId")
 SELECT "organizationId",id,"createdAt","createdByUserId","createdLocationId" FROM "Customer";
DROP POLICY address_preference_backfill ON "Customer";
CREATE TABLE "CustomerAddressCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL,
 "customerId" uuid NOT NULL, "addressId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('UPDATE','ARCHIVE','SET_DEFAULT','CLEAR_DEFAULT')),
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer, "resultStatus" text,
 "expectedPreferenceVersion" integer, "resultPreferenceVersion" integer, "resultDefaultAddressId" uuid,
 "privateDataEncrypted" text, "snapshotHash" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","customerId",id),
 UNIQUE("organizationId","customerId","addressId",id),
 FOREIGN KEY("organizationId","customerId","addressId") REFERENCES "CustomerAddress"("organizationId","customerId",id),
 FOREIGN KEY("organizationId","customerId","resultDefaultAddressId") REFERENCES "CustomerAddress"("organizationId","customerId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL AND "resultVersion" IS NULL
   AND "resultStatus" IS NULL AND "expectedPreferenceVersion" IS NULL AND "resultPreferenceVersion" IS NULL
   AND "resultDefaultAddressId" IS NULL AND "privateDataEncrypted" IS NULL AND "snapshotHash" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion">0 AND "resultVersion" IS NOT NULL
   AND "resultVersion"::bigint="expectedVersion"::bigint+CASE WHEN action IN ('UPDATE','ARCHIVE') THEN 1 ELSE 0 END
   AND "resultStatus" IS NOT NULL AND "resultStatus"=CASE WHEN action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END
   AND "expectedPreferenceVersion" IS NOT NULL AND "expectedPreferenceVersion">0 AND "resultPreferenceVersion" IS NOT NULL
   AND ((action='UPDATE' AND "resultPreferenceVersion"="expectedPreferenceVersion")
    OR (action='ARCHIVE' AND "resultDefaultAddressId" IS DISTINCT FROM "addressId"
      AND ("resultPreferenceVersion"="expectedPreferenceVersion" OR
       ("resultPreferenceVersion"::bigint="expectedPreferenceVersion"::bigint+1 AND "resultDefaultAddressId" IS NULL)))
    OR (action IN ('SET_DEFAULT','CLEAR_DEFAULT') AND "resultPreferenceVersion"::bigint="expectedPreferenceVersion"::bigint+1
      AND ((action='SET_DEFAULT' AND "resultDefaultAddressId" IS NOT NULL AND "resultDefaultAddressId"="addressId")
        OR (action='CLEAR_DEFAULT' AND "resultDefaultAddressId" IS NULL))))
   AND ((action='UPDATE' AND "privateDataEncrypted" IS NOT NULL
      AND length("privateDataEncrypted") BETWEEN 40 AND 16384 AND "privateDataEncrypted" ~ '^[A-Za-z0-9_-]+$'
      AND "snapshotHash" IS NOT NULL AND "snapshotHash" ~ '^[0-9a-f]{64}$')
    OR (action<>'UPDATE' AND "privateDataEncrypted" IS NULL AND "snapshotHash" IS NULL))))
);
CREATE UNIQUE INDEX customer_address_command_content_version ON "CustomerAddressCommand"("organizationId","addressId","resultVersion")
 WHERE status='SUCCEEDED' AND action IN ('UPDATE','ARCHIVE');
CREATE UNIQUE INDEX customer_address_command_preference_version ON "CustomerAddressCommand"("organizationId","customerId","resultPreferenceVersion")
 WHERE status='SUCCEEDED' AND "resultPreferenceVersion">"expectedPreferenceVersion";
ALTER TABLE "CustomerAddress" ADD FOREIGN KEY("organizationId","customerId",id,"lastCommandId")
 REFERENCES "CustomerAddressCommand"("organizationId","customerId","addressId",id);
ALTER TABLE "CustomerAddressPreference" ADD FOREIGN KEY("organizationId","customerId","lastCommandId")
 REFERENCES "CustomerAddressCommand"("organizationId","customerId",id);
ALTER TABLE "CustomerAddressPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddressPreference" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddressCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddressCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CustomerAddressPreference" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "CustomerAddressCommand" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "CustomerAddressPreference","CustomerAddressCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "CustomerAddressPreference","CustomerAddressCommand" TO pos_runtime;
GRANT UPDATE("defaultAddressId",version,"updatedAt","updatedByUserId","updatedLocationId","lastCommandId") ON "CustomerAddressPreference" TO pos_runtime;
REVOKE UPDATE ON "CustomerAddress" FROM pos_runtime;
GRANT UPDATE(status,version,"privateDataEncrypted","snapshotHash","updatedAt","updatedByUserId","updatedLocationId","lastCommandId",
 "archivedAt","archivedByUserId","archivedLocationId","archiveRequestKey","archiveRequestHash") ON "CustomerAddress" TO pos_runtime;
CREATE TRIGGER customer_address_command_immutable BEFORE UPDATE OR DELETE ON "CustomerAddressCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.validate_address_management_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE customer public."Customer"; address public."CustomerAddress"; preference public."CustomerAddressPreference";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'address command requires current active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO customer FROM public."Customer" WHERE "organizationId"=NEW."organizationId" AND id=NEW."customerId" FOR UPDATE;
 SELECT * INTO address FROM public."CustomerAddress" WHERE "organizationId"=NEW."organizationId" AND "customerId"=NEW."customerId" AND id=NEW."addressId" FOR UPDATE;
 SELECT * INTO preference FROM public."CustomerAddressPreference" WHERE "organizationId"=NEW."organizationId" AND "customerId"=NEW."customerId" FOR UPDATE;
 IF customer.id IS NULL OR address.id IS NULL OR preference."customerId" IS NULL THEN
  RAISE EXCEPTION 'address command requires matching scoped customer, address and preference' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public."CustomerAddress" WHERE "organizationId"=NEW."organizationId" AND "archiveRequestKey"=NEW."requestKey") THEN
  RAISE EXCEPTION 'address command key already belongs to an archive' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  IF customer.status<>'ACTIVE' OR address.status<>'ACTIVE' OR NEW."expectedVersion" IS DISTINCT FROM address.version THEN
   RAISE EXCEPTION 'address command requires active customer, active address and current version' USING ERRCODE='23514'; END IF;
  IF NEW.action IN ('SET_DEFAULT','CLEAR_DEFAULT') THEN
   IF NEW."expectedPreferenceVersion" IS DISTINCT FROM preference.version
    OR (NEW.action='SET_DEFAULT' AND preference."defaultAddressId" IS NOT DISTINCT FROM address.id)
    OR (NEW.action='CLEAR_DEFAULT' AND preference."defaultAddressId" IS DISTINCT FROM address.id) THEN
    RAISE EXCEPTION 'address preference version or selection conflict' USING ERRCODE='23514'; END IF;
  END IF;
  NEW."resultVersion":=address.version+CASE WHEN NEW.action IN ('UPDATE','ARCHIVE') THEN 1 ELSE 0 END;
  NEW."resultStatus":=CASE WHEN NEW.action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END;
  NEW."expectedPreferenceVersion":=preference.version;
  NEW."resultPreferenceVersion":=preference.version;
  NEW."resultDefaultAddressId":=preference."defaultAddressId";
  IF NEW.action='SET_DEFAULT' THEN
   NEW."resultPreferenceVersion":=preference.version+1; NEW."resultDefaultAddressId":=address.id;
  ELSIF NEW.action='CLEAR_DEFAULT' OR (NEW.action='ARCHIVE' AND preference."defaultAddressId"=address.id) THEN
   NEW."resultPreferenceVersion":=preference.version+1; NEW."resultDefaultAddressId":=NULL;
  END IF;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_command_validation BEFORE INSERT ON "CustomerAddressCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_address_management_command();

CREATE OR REPLACE FUNCTION public.protect_customer_address() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command public."CustomerAddressCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer addresses are archived, never deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW.version<>1 OR NEW."lastCommandId" IS NOT NULL
   OR NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."createdLocationId",NEW."createdByUserId") THEN
   RAISE EXCEPTION 'customer address creation requires active initial state and current scoped actor' USING ERRCODE='23514'; END IF;
  NEW."createdAt":=statement_timestamp(); NEW."updatedAt":=NEW."createdAt";
  NEW."updatedByUserId":=NEW."createdByUserId"; NEW."updatedLocationId":=NEW."createdLocationId";
  RETURN NEW;
 END IF;
 SELECT * INTO command FROM public."CustomerAddressCommand" WHERE "organizationId"=NEW."organizationId"
  AND "customerId"=NEW."customerId" AND "addressId"=NEW.id AND id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."CustomerAddressCommand" WHERE id=NEW."lastCommandId";
 IF command.id IS NULL OR command.status<>'SUCCEEDED' OR command.action NOT IN ('UPDATE','ARCHIVE')
  OR command_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR command."expectedVersion" IS DISTINCT FROM OLD.version OR command."resultVersion" IS DISTINCT FROM NEW.version
  OR command."resultStatus" IS DISTINCT FROM NEW.status
  OR (NEW."updatedAt",NEW."updatedByUserId",NEW."updatedLocationId") IS DISTINCT FROM (command."createdAt",command."actorUserId",command."locationId")
  OR (command.action='UPDATE' AND (NEW."privateDataEncrypted",NEW."snapshotHash") IS DISTINCT FROM (command."privateDataEncrypted",command."snapshotHash"))
  OR (command.action='ARCHIVE' AND (NEW."privateDataEncrypted",NEW."snapshotHash") IS DISTINCT FROM (OLD."privateDataEncrypted",OLD."snapshotHash"))
  OR (command.action='ARCHIVE' AND (NEW."archivedAt",NEW."archivedByUserId",NEW."archivedLocationId",NEW."archiveRequestKey",NEW."archiveRequestHash")
    IS DISTINCT FROM (command."createdAt",command."actorUserId",command."locationId",command."requestKey",command."requestHash"))
  OR (command.action='UPDATE' AND (NEW."archivedAt",NEW."archivedByUserId",NEW."archivedLocationId",NEW."archiveRequestKey",NEW."archiveRequestHash")
    IS DISTINCT FROM (OLD."archivedAt",OLD."archivedByUserId",OLD."archivedLocationId",OLD."archiveRequestKey",OLD."archiveRequestHash"))
  OR (to_jsonb(NEW)-ARRAY['status','version','privateDataEncrypted','snapshotHash','updatedAt','updatedByUserId','updatedLocationId','lastCommandId','archivedAt','archivedByUserId','archivedLocationId','archiveRequestKey','archiveRequestHash'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','privateDataEncrypted','snapshotHash','updatedAt','updatedByUserId','updatedLocationId','lastCommandId','archivedAt','archivedByUserId','archivedLocationId','archiveRequestKey','archiveRequestHash']) THEN
  RAISE EXCEPTION 'address change requires its atomic immutable command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_history BEFORE INSERT OR UPDATE OR DELETE ON "CustomerAddress"
 FOR EACH ROW EXECUTE FUNCTION public.protect_customer_address();
CREATE TRIGGER customer_address_active_parent BEFORE INSERT OR UPDATE ON "CustomerAddress"
 FOR EACH ROW EXECUTE FUNCTION public.require_active_address_customer();

CREATE FUNCTION public.protect_customer_address_preference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command public."CustomerAddressCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer address preferences are never deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF pg_trigger_depth()<2 OR NEW.version<>1 OR NEW."defaultAddressId" IS NOT NULL OR NEW."lastCommandId" IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM public."Customer" c WHERE c."organizationId"=NEW."organizationId" AND c.id=NEW."customerId"
    AND c.xmin=pg_current_xact_id()::text::xid
    AND (c."createdAt",c."createdByUserId",c."createdLocationId") IS NOT DISTINCT FROM (NEW."updatedAt",NEW."updatedByUserId",NEW."updatedLocationId")) THEN
   RAISE EXCEPTION 'address preference starts with its atomic customer creation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO command FROM public."CustomerAddressCommand" WHERE "organizationId"=NEW."organizationId" AND "customerId"=NEW."customerId" AND id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."CustomerAddressCommand" WHERE id=NEW."lastCommandId";
 IF command.id IS NULL OR command.status<>'SUCCEEDED'
  OR command_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR command."expectedPreferenceVersion" IS DISTINCT FROM OLD.version
  OR command."resultPreferenceVersion" IS DISTINCT FROM NEW.version OR NEW.version<>OLD.version+1
  OR command."resultDefaultAddressId" IS DISTINCT FROM NEW."defaultAddressId"
  OR (NEW."updatedAt",NEW."updatedByUserId",NEW."updatedLocationId") IS DISTINCT FROM (command."createdAt",command."actorUserId",command."locationId")
  OR (NEW."organizationId",NEW."customerId") IS DISTINCT FROM (OLD."organizationId",OLD."customerId") THEN
  RAISE EXCEPTION 'address preference requires its atomic immutable command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_preference_protection BEFORE INSERT OR UPDATE OR DELETE ON "CustomerAddressPreference"
 FOR EACH ROW EXECUTE FUNCTION public.protect_customer_address_preference();
CREATE FUNCTION public.create_customer_address_preference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public."CustomerAddressPreference"("organizationId","customerId","updatedAt","updatedByUserId","updatedLocationId")
 VALUES(NEW."organizationId",NEW.id,NEW."createdAt",NEW."createdByUserId",NEW."createdLocationId");
 RETURN NULL;
END $$;
CREATE TRIGGER customer_address_preference_creation AFTER INSERT ON "Customer"
 FOR EACH ROW EXECUTE FUNCTION public.create_customer_address_preference();
CREATE FUNCTION public.apply_address_management_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status<>'SUCCEEDED' THEN RETURN NULL; END IF;
 IF NEW.action IN ('UPDATE','ARCHIVE') THEN
  UPDATE public."CustomerAddress" SET status=NEW."resultStatus",version=NEW."resultVersion",
   "updatedAt"=NEW."createdAt","updatedByUserId"=NEW."actorUserId","updatedLocationId"=NEW."locationId","lastCommandId"=NEW.id,
   "privateDataEncrypted"=CASE WHEN NEW.action='UPDATE' THEN NEW."privateDataEncrypted" ELSE "privateDataEncrypted" END,
   "snapshotHash"=CASE WHEN NEW.action='UPDATE' THEN NEW."snapshotHash" ELSE "snapshotHash" END,
   "archivedAt"=CASE WHEN NEW.action='ARCHIVE' THEN NEW."createdAt" ELSE "archivedAt" END,
   "archivedByUserId"=CASE WHEN NEW.action='ARCHIVE' THEN NEW."actorUserId" ELSE "archivedByUserId" END,
   "archivedLocationId"=CASE WHEN NEW.action='ARCHIVE' THEN NEW."locationId" ELSE "archivedLocationId" END,
   "archiveRequestKey"=CASE WHEN NEW.action='ARCHIVE' THEN NEW."requestKey" ELSE "archiveRequestKey" END,
   "archiveRequestHash"=CASE WHEN NEW.action='ARCHIVE' THEN NEW."requestHash" ELSE "archiveRequestHash" END
   WHERE "organizationId"=NEW."organizationId" AND "customerId"=NEW."customerId" AND id=NEW."addressId";
 END IF;
 IF NEW."resultPreferenceVersion"<>NEW."expectedPreferenceVersion" THEN
  UPDATE public."CustomerAddressPreference" SET "defaultAddressId"=NEW."resultDefaultAddressId",version=NEW."resultPreferenceVersion",
   "updatedAt"=NEW."createdAt","updatedByUserId"=NEW."actorUserId","updatedLocationId"=NEW."locationId","lastCommandId"=NEW.id
   WHERE "organizationId"=NEW."organizationId" AND "customerId"=NEW."customerId";
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER customer_address_command_apply AFTER INSERT ON "CustomerAddressCommand"
 FOR EACH ROW EXECUTE FUNCTION public.apply_address_management_command();
REVOKE ALL ON FUNCTION public.validate_address_management_command(),public.protect_customer_address(),
 public.protect_customer_address_preference(),public.create_customer_address_preference(),public.apply_address_management_command() FROM PUBLIC;
COMMIT;
