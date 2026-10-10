BEGIN;
-- Existing contact ciphertext, hashes, identities and creation metadata are preserved.
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_version_check";
ALTER TABLE "Customer"
 ADD CONSTRAINT customer_version_positive CHECK(version>0),
 ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 ADD COLUMN "updatedAt" timestamptz(3),
 ADD COLUMN "updatedByUserId" uuid,
 ADD COLUMN "updatedLocationId" uuid,
 ADD COLUMN "lastCommandId" uuid;
DROP TRIGGER customer_immutable ON "Customer";
LOCK TABLE "Customer" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 EXECUTE format('CREATE POLICY customer_management_backfill ON "Customer" TO %I USING (true) WITH CHECK (true)',current_user);
END $$;
UPDATE "Customer" SET "updatedAt"="createdAt","updatedByUserId"="createdByUserId","updatedLocationId"="createdLocationId";
DROP POLICY customer_management_backfill ON "Customer";
ALTER TABLE "Customer"
 ALTER COLUMN "updatedAt" SET NOT NULL,
 ALTER COLUMN "updatedByUserId" SET NOT NULL,
 ALTER COLUMN "updatedLocationId" SET NOT NULL,
 ADD FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 ADD FOREIGN KEY("organizationId","updatedLocationId") REFERENCES "Location"("organizationId",id);

CREATE TABLE "CustomerCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL,
 "customerId" uuid NOT NULL, "locationId" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, action text NOT NULL CHECK(action IN ('UPDATE','ARCHIVE','RESTORE')),
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer, "resultStatus" text,
 "privateDataEncrypted" text, "phoneLookupHash" text, "nameLookupHash" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","customerId",id),
 UNIQUE("organizationId","customerId","resultVersion"),
 FOREIGN KEY("organizationId","customerId") REFERENCES "Customer"("organizationId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultVersion" IS NULL AND "resultStatus" IS NULL AND "privateDataEncrypted" IS NULL
   AND "phoneLookupHash" IS NULL AND "nameLookupHash" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion" BETWEEN 1 AND 2147483646
   AND "resultVersion" IS NOT NULL AND "resultVersion"="expectedVersion"+1
   AND "resultStatus" IS NOT NULL AND "resultStatus"=CASE WHEN action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END
   AND ((action='UPDATE' AND "privateDataEncrypted" IS NOT NULL
     AND length("privateDataEncrypted") BETWEEN 40 AND 4096 AND "privateDataEncrypted" ~ '^[A-Za-z0-9_-]+$'
     AND "phoneLookupHash" IS NOT NULL AND "phoneLookupHash" ~ '^[0-9a-f]{64}$'
     AND ("nameLookupHash" IS NULL OR "nameLookupHash" ~ '^[0-9a-f]{64}$'))
    OR (action IN ('ARCHIVE','RESTORE') AND "privateDataEncrypted" IS NULL
     AND "phoneLookupHash" IS NULL AND "nameLookupHash" IS NULL))))
);
ALTER TABLE "CustomerCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CustomerCommand" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "CustomerCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "CustomerCommand" TO pos_runtime;
CREATE TRIGGER customer_command_immutable BEFORE UPDATE OR DELETE ON "CustomerCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "Customer" ADD FOREIGN KEY("organizationId",id,"lastCommandId")
 REFERENCES "CustomerCommand"("organizationId","customerId",id);
GRANT UPDATE(status,version,"privateDataEncrypted","phoneLookupHash","nameLookupHash",
 "updatedAt","updatedByUserId","updatedLocationId","lastCommandId") ON "Customer" TO pos_runtime;

CREATE FUNCTION public.validate_customer_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE customer public."Customer";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'customer command requires current active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO customer FROM public."Customer" WHERE "organizationId"=NEW."organizationId" AND id=NEW."customerId" FOR UPDATE;
 IF customer.id IS NULL THEN RAISE EXCEPTION 'customer command requires scoped customer' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  IF NEW."expectedVersion" IS DISTINCT FROM customer.version THEN
   RAISE EXCEPTION 'customer version conflict' USING ERRCODE='23514'; END IF;
  IF (NEW.action IN ('UPDATE','ARCHIVE') AND customer.status<>'ACTIVE')
   OR (NEW.action='RESTORE' AND customer.status<>'ARCHIVED') THEN
   RAISE EXCEPTION 'customer action requires matching current state' USING ERRCODE='23514'; END IF;
  NEW."resultVersion":=customer.version+1;
  NEW."resultStatus":=CASE WHEN NEW.action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER customer_command_validation BEFORE INSERT ON "CustomerCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_customer_command();

CREATE FUNCTION public.protect_customer_profile() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command public."CustomerCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customers are archived, never deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW."lastCommandId" IS NOT NULL THEN
   RAISE EXCEPTION 'customer starts active without a mutation command' USING ERRCODE='23514'; END IF;
  NEW."updatedAt":=NEW."createdAt";
  NEW."updatedByUserId":=NEW."createdByUserId";
  NEW."updatedLocationId":=NEW."createdLocationId";
  RETURN NEW;
 END IF;
 SELECT * INTO command FROM public."CustomerCommand" WHERE "organizationId"=NEW."organizationId"
  AND "customerId"=NEW.id AND id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."CustomerCommand" WHERE id=NEW."lastCommandId";
 IF command.id IS NULL OR command.status<>'SUCCEEDED'
  OR command_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR command."expectedVersion" IS DISTINCT FROM OLD.version OR command."resultVersion" IS DISTINCT FROM NEW.version
  OR command."resultStatus" IS DISTINCT FROM NEW.status
  OR command."actorUserId" IS DISTINCT FROM NEW."updatedByUserId"
  OR command."locationId" IS DISTINCT FROM NEW."updatedLocationId"
  OR command."createdAt" IS DISTINCT FROM NEW."updatedAt"
  OR (command.action='UPDATE' AND
   (NEW."privateDataEncrypted",NEW."phoneLookupHash",NEW."nameLookupHash") IS DISTINCT FROM
   (command."privateDataEncrypted",command."phoneLookupHash",command."nameLookupHash"))
  OR (command.action<>'UPDATE' AND
   (NEW."privateDataEncrypted",NEW."phoneLookupHash",NEW."nameLookupHash") IS DISTINCT FROM
   (OLD."privateDataEncrypted",OLD."phoneLookupHash",OLD."nameLookupHash"))
  OR (to_jsonb(NEW)-ARRAY['status','version','privateDataEncrypted','phoneLookupHash','nameLookupHash','updatedAt','updatedByUserId','updatedLocationId','lastCommandId'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','privateDataEncrypted','phoneLookupHash','nameLookupHash','updatedAt','updatedByUserId','updatedLocationId','lastCommandId']) THEN
  RAISE EXCEPTION 'customer change requires its atomic immutable command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
-- Alphabetical ordering keeps existing creation validation before initial projection fields.
CREATE TRIGGER customer_profile_protection BEFORE INSERT OR UPDATE OR DELETE ON "Customer"
 FOR EACH ROW EXECUTE FUNCTION public.protect_customer_profile();
CREATE FUNCTION public.apply_customer_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  UPDATE public."Customer" SET status=NEW."resultStatus",version=NEW."resultVersion",
   "updatedAt"=NEW."createdAt","updatedByUserId"=NEW."actorUserId","updatedLocationId"=NEW."locationId","lastCommandId"=NEW.id,
   "privateDataEncrypted"=CASE WHEN NEW.action='UPDATE' THEN NEW."privateDataEncrypted" ELSE "privateDataEncrypted" END,
   "phoneLookupHash"=CASE WHEN NEW.action='UPDATE' THEN NEW."phoneLookupHash" ELSE "phoneLookupHash" END,
   "nameLookupHash"=CASE WHEN NEW.action='UPDATE' THEN NEW."nameLookupHash" ELSE "nameLookupHash" END
   WHERE "organizationId"=NEW."organizationId" AND id=NEW."customerId";
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER customer_command_apply AFTER INSERT ON "CustomerCommand"
 FOR EACH ROW EXECUTE FUNCTION public.apply_customer_command();

CREATE OR REPLACE FUNCTION public.validate_order_customer_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."customerId" IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND
  (NEW."customerId",NEW."customerVersionSnapshot",NEW."customerDataEncrypted",NEW."customerNameLookupHash",NEW."customerPhoneLookupHash")
  IS NOT DISTINCT FROM
  (OLD."customerId",OLD."customerVersionSnapshot",OLD."customerDataEncrypted",OLD."customerNameLookupHash",OLD."customerPhoneLookupHash") THEN RETURN NEW; END IF;
 PERFORM 1 FROM public."Customer" c WHERE c."organizationId"=NEW."organizationId" AND c.id=NEW."customerId"
  AND c.status='ACTIVE' AND c.version=NEW."customerVersionSnapshot" AND NEW."customerDataEncrypted" IS NOT NULL
  AND (c."phoneLookupHash",c."nameLookupHash") IS NOT DISTINCT FROM (NEW."customerPhoneLookupHash",NEW."customerNameLookupHash") FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'order customer reference requires the current matching contact snapshot on an active customer' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.require_active_address_customer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public."Customer" WHERE "organizationId"=NEW."organizationId" AND id=NEW."customerId" AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'address mutation requires an active customer' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_active_parent BEFORE INSERT OR UPDATE ON "CustomerAddress"
 FOR EACH ROW EXECUTE FUNCTION public.require_active_address_customer();
CREATE FUNCTION public.require_active_order_address_customer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."customerAddressId" IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND
  (NEW."customerId",NEW."customerAddressId",NEW."customerAddressVersionSnapshot",NEW."deliveryAddressEncrypted",NEW."deliveryAddressHash")
  IS NOT DISTINCT FROM
  (OLD."customerId",OLD."customerAddressId",OLD."customerAddressVersionSnapshot",OLD."deliveryAddressEncrypted",OLD."deliveryAddressHash") THEN RETURN NEW; END IF;
 PERFORM 1 FROM public."Customer" WHERE "organizationId"=NEW."organizationId" AND id=NEW."customerId" AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'address selection requires an active customer' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_address_active_customer BEFORE INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.require_active_order_address_customer();
REVOKE ALL ON FUNCTION public.validate_customer_command(),public.protect_customer_profile(),public.apply_customer_command(),
 public.require_active_address_customer(),public.require_active_order_address_customer() FROM PUBLIC;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
 ('customers.update','Editarea clienților organizației',ARRAY['ORGANIZATION'],true),
 ('customers.archive','Arhivarea și restaurarea clienților organizației',ARRAY['ORGANIZATION'],true);
COMMIT;
