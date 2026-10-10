BEGIN;
CREATE TABLE "CustomerAddress" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "customerId" uuid NOT NULL,
 "createdLocationId" uuid NOT NULL, "createdByUserId" uuid NOT NULL,
 "privateDataEncrypted" text NOT NULL CHECK(length("privateDataEncrypted") BETWEEN 40 AND 16384 AND "privateDataEncrypted" ~ '^[A-Za-z0-9_-]+$'),
 "snapshotHash" text NOT NULL CHECK("snapshotHash" ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'ACTIVE', version integer NOT NULL DEFAULT 1,
 "creationRequestKey" uuid NOT NULL, "creationRequestHash" text NOT NULL CHECK("creationRequestHash" ~ '^[0-9a-f]{64}$'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "archivedAt" timestamptz(3), "archivedByUserId" uuid, "archivedLocationId" uuid,
 "archiveRequestKey" uuid, "archiveRequestHash" text,
 UNIQUE("organizationId",id), UNIQUE("organizationId","customerId",id),
 CONSTRAINT customer_address_creation_identity UNIQUE("organizationId","customerId","createdLocationId","creationRequestKey"),
 UNIQUE("organizationId","archiveRequestKey"),
 FOREIGN KEY("organizationId","customerId") REFERENCES "Customer"("organizationId",id),
 FOREIGN KEY("organizationId","createdLocationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","archivedLocationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","archivedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 CONSTRAINT customer_address_archive_shape CHECK(
  (status='ACTIVE' AND version=1 AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL AND "archivedLocationId" IS NULL AND "archiveRequestKey" IS NULL AND "archiveRequestHash" IS NULL)
  OR (status='ARCHIVED' AND version=2 AND "archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL AND "archivedLocationId" IS NOT NULL AND "archiveRequestKey" IS NOT NULL AND "archiveRequestHash" IS NOT NULL AND "archiveRequestHash" ~ '^[0-9a-f]{64}$'))
);
CREATE TABLE "CustomerAddressCreationClaim" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "customerId" uuid NOT NULL,
 "locationId" uuid NOT NULL, "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 status text NOT NULL, "addressId" uuid, "requestHash" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT customer_address_claim_identity UNIQUE("organizationId","customerId","locationId","requestKey"),
 UNIQUE("organizationId","addressId"),
 CHECK((status='CREATED' AND "addressId" IS NOT NULL AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$')
  OR (status='RETIRED' AND "addressId" IS NULL AND "requestHash" IS NULL)),
 FOREIGN KEY("organizationId","customerId") REFERENCES "Customer"("organizationId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","customerId","addressId") REFERENCES "CustomerAddress"("organizationId","customerId",id)
);
ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddress" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddressCreationClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddressCreationClaim" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CustomerAddress" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "CustomerAddressCreationClaim" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "CustomerAddress","CustomerAddressCreationClaim" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE ON "CustomerAddress" TO pos_runtime;
GRANT SELECT,INSERT ON "CustomerAddressCreationClaim" TO pos_runtime;
CREATE TRIGGER customer_address_claim_immutable BEFORE UPDATE OR DELETE ON "CustomerAddressCreationClaim"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.customer_address_actor_allowed(org uuid,loc uuid,actor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT actor IS NOT DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM public."Location" l WHERE l."organizationId"=org AND l.id=loc AND l.status='ACTIVE')
  AND EXISTS(SELECT 1 FROM public."CompanyUser" u WHERE u."organizationId"=org AND u.id=actor AND u.status='ACTIVE'
   AND (u."isPrimaryAdmin" OR EXISTS(SELECT 1 FROM public."UserLocationAccess" a WHERE a."organizationId"=org AND a."locationId"=loc AND a."userId"=actor)))
$$;
REVOKE ALL ON FUNCTION public.customer_address_actor_allowed(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_address_actor_allowed(uuid,uuid,uuid) TO pos_runtime;
CREATE FUNCTION public.protect_customer_address() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer addresses are archived, never deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW.version<>1
   OR NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."createdLocationId",NEW."createdByUserId") THEN
   RAISE EXCEPTION 'customer address creation requires active initial state and current scoped actor' USING ERRCODE='23514';
  END IF;
  NEW."createdAt":=statement_timestamp();
 ELSE
  IF OLD.status<>'ACTIVE' OR NEW.status<>'ARCHIVED' OR NEW.version<>OLD.version+1
   OR (to_jsonb(NEW)-ARRAY['status','version','archivedAt','archivedByUserId','archivedLocationId','archiveRequestKey','archiveRequestHash'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','archivedAt','archivedByUserId','archivedLocationId','archiveRequestKey','archiveRequestHash'])
   OR NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."archivedLocationId",NEW."archivedByUserId") THEN
   RAISE EXCEPTION 'customer address content is immutable; archive once with current scoped actor' USING ERRCODE='23514';
  END IF;
  NEW."archivedAt":=statement_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_history BEFORE INSERT OR UPDATE OR DELETE ON "CustomerAddress"
 FOR EACH ROW EXECUTE FUNCTION public.protect_customer_address();
CREATE FUNCTION public.validate_customer_address_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.customer_address_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'address claim requires current scoped actor' USING ERRCODE='23514'; END IF;
 IF NEW.status='CREATED' THEN
  IF pg_trigger_depth()<2 OR NOT EXISTS(SELECT 1 FROM public."CustomerAddress" a
   WHERE a."organizationId"=NEW."organizationId" AND a.id=NEW."addressId" AND a.xmin=pg_current_xact_id()::text::xid
   AND (a."customerId",a."createdLocationId",a."creationRequestKey",a."createdByUserId",a."creationRequestHash")
    IS NOT DISTINCT FROM (NEW."customerId",NEW."locationId",NEW."requestKey",NEW."actorUserId",NEW."requestHash")) THEN
   RAISE EXCEPTION 'created address claim requires its exact atomic address identity' USING ERRCODE='23514'; END IF;
 ELSIF NEW.status='RETIRED' AND EXISTS(SELECT 1 FROM public."CustomerAddress" a WHERE a."organizationId"=NEW."organizationId"
  AND a."customerId"=NEW."customerId" AND a."createdLocationId"=NEW."locationId" AND a."creationRequestKey"=NEW."requestKey") THEN
  RAISE EXCEPTION 'cannot retire a created address key' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER customer_address_claim_validation BEFORE INSERT ON "CustomerAddressCreationClaim"
 FOR EACH ROW EXECUTE FUNCTION public.validate_customer_address_claim();
CREATE FUNCTION public.claim_created_customer_address() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- The same UNIQUE terminal identity arbitrates CREATE/RETIRE even for stale RR snapshots.
 INSERT INTO public."CustomerAddressCreationClaim"(id,"organizationId","customerId","locationId","requestKey","actorUserId",status,"addressId","requestHash")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."customerId",NEW."createdLocationId",NEW."creationRequestKey",NEW."createdByUserId",'CREATED',NEW.id,NEW."creationRequestHash");
 RETURN NULL;
END $$;
CREATE TRIGGER customer_address_creation_claim AFTER INSERT ON "CustomerAddress"
 FOR EACH ROW EXECUTE FUNCTION public.claim_created_customer_address();
CREATE FUNCTION public.check_customer_address_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='CREATED' AND NOT EXISTS(SELECT 1 FROM public."CustomerAddress" a WHERE a."organizationId"=NEW."organizationId"
  AND a.id=NEW."addressId" AND a.xmin=pg_current_xact_id()::text::xid
  AND (a."customerId",a."createdLocationId",a."creationRequestKey",a."createdByUserId",a."creationRequestHash")
   IS NOT DISTINCT FROM (NEW."customerId",NEW."locationId",NEW."requestKey",NEW."actorUserId",NEW."requestHash")) THEN
  RAISE EXCEPTION 'address and created claim must commit with exact identity together' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER customer_address_claim_consistency AFTER INSERT ON "CustomerAddressCreationClaim"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_customer_address_claim();
ALTER TABLE "Order" ADD COLUMN "deliveryAddressEncrypted" text, ADD COLUMN "deliveryAddressHash" text,
 ADD COLUMN "customerAddressId" uuid, ADD COLUMN "customerAddressVersionSnapshot" integer,
 ADD CONSTRAINT order_delivery_address_shape CHECK(
  ("deliveryAddressEncrypted" IS NULL AND "deliveryAddressHash" IS NULL AND "customerAddressId" IS NULL AND "customerAddressVersionSnapshot" IS NULL)
  OR ("serviceType"='DELIVERY' AND "deliveryAddressEncrypted" IS NOT NULL
   AND length("deliveryAddressEncrypted") BETWEEN 40 AND 16384 AND "deliveryAddressEncrypted" ~ '^[A-Za-z0-9_-]+$'
   AND "deliveryAddressHash" IS NOT NULL AND "deliveryAddressHash" ~ '^[0-9a-f]{64}$'
   AND (("customerAddressId" IS NULL AND "customerAddressVersionSnapshot" IS NULL)
    OR ("customerAddressId" IS NOT NULL AND "customerAddressVersionSnapshot" IS NOT NULL AND "customerAddressVersionSnapshot">0 AND "customerId" IS NOT NULL)))),
 ADD CONSTRAINT order_customer_address_fk FOREIGN KEY("organizationId","customerId","customerAddressId") REFERENCES "CustomerAddress"("organizationId","customerId",id);
CREATE FUNCTION public.validate_order_address_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."customerAddressId" IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND
  (NEW."customerId",NEW."customerAddressId",NEW."customerAddressVersionSnapshot",NEW."deliveryAddressEncrypted",NEW."deliveryAddressHash")
  IS NOT DISTINCT FROM (OLD."customerId",OLD."customerAddressId",OLD."customerAddressVersionSnapshot",OLD."deliveryAddressEncrypted",OLD."deliveryAddressHash") THEN RETURN NEW; END IF;
 PERFORM 1 FROM public."CustomerAddress" a WHERE a."organizationId"=NEW."organizationId" AND a.id=NEW."customerAddressId"
  AND a."customerId"=NEW."customerId" AND a.status='ACTIVE' AND a.version=NEW."customerAddressVersionSnapshot" AND a."snapshotHash"=NEW."deliveryAddressHash" FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'order address selection requires active matching customer, version and snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_address_reference_validation BEFORE INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_address_reference();
INSERT INTO public."Permission"(key,label,"scopeTypes",delegable)
 VALUES('customers.addresses.manage','Administrarea adreselor clienților',ARRAY['ORGANIZATION'],true);

CREATE OR REPLACE FUNCTION public.protect_order_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE old_state text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW."kitchenStatus"<>'NOT_SENT' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'orders begin as unsent drafts' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 old_state:=public.effective_order_status(OLD.status,OLD."kitchenStatus");
 IF NEW.status='CANCELLED' AND OLD."deliveryStatus" IN ('ASSIGNED','PICKED_UP','DELIVERING','DELIVERED') THEN
  RAISE EXCEPTION 'resolve the active delivery before cancellation' USING ERRCODE='23514';
 END IF;
 IF NEW.version=OLD.version+1 AND NEW.status=old_state AND NEW."kitchenStatus"=public.effective_kitchen_status(OLD."kitchenStatus")
  AND (to_jsonb(NEW)-ARRAY['status','kitchenStatus','deliveryStatus','deliveryCourierId','deliveryCourierName','version','updatedByUserId','updatedAt'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','kitchenStatus','deliveryStatus','deliveryCourierId','deliveryCourierName','version','updatedByUserId','updatedAt'])
  AND EXISTS (SELECT 1 FROM public."DeliveryOperation" op WHERE op."organizationId"=NEW."organizationId"
   AND op."locationId"=NEW."locationId" AND op."orderId"=NEW.id AND op."orderVersion"=NEW.version
   AND (op."actorUserId",op."toStatus",op."courierUserId",op."courierName")
    IS NOT DISTINCT FROM (NEW."updatedByUserId",NEW."deliveryStatus",NEW."deliveryCourierId",NEW."deliveryCourierName")
   AND op.xmin=pg_current_xact_id()::text::xid) THEN
  RETURN NEW;
 END IF;
 IF NEW.version=OLD.version+1 AND NEW.status=old_state AND NEW."kitchenStatus"=public.effective_kitchen_status(OLD."kitchenStatus")
  AND (to_jsonb(NEW)-ARRAY['status','kitchenStatus','version','updatedByUserId','updatedAt'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','kitchenStatus','version','updatedByUserId','updatedAt'])
  AND EXISTS (SELECT 1 FROM public."PaymentOperation" op WHERE op."organizationId"=NEW."organizationId"
   AND op."locationId"=NEW."locationId" AND op."orderId"=NEW.id AND op."orderVersion"=NEW.version
   AND op."actorUserId"=NEW."updatedByUserId" AND op.xmin=pg_current_xact_id()::text::xid) THEN
  RETURN NEW;
 END IF;
 IF NEW."deliveryStatus" IS DISTINCT FROM OLD."deliveryStatus" AND NOT
  (OLD.status='DRAFT' AND NEW."serviceType" IS DISTINCT FROM OLD."serviceType"
   AND NEW."deliveryStatus"=CASE WHEN NEW."serviceType"='DELIVERY' THEN 'WAITING_COURIER' ELSE 'NOT_REQUIRED' END) THEN
  RAISE EXCEPTION 'delivery status requires an atomic delivery operation' USING ERRCODE='23514';
 END IF;
 IF NEW.version<>OLD.version+1 OR NEW.status='OPEN' OR NEW."kitchenStatus"='NEW'
  OR (to_jsonb(NEW)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','deliveryAddressEncrypted','deliveryAddressHash','customerAddressId','customerAddressVersionSnapshot','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','deliveryAddressEncrypted','deliveryAddressHash','customerAddressId','customerAddressVersionSnapshot','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
  OR (OLD.status<>'DRAFT' AND
   (to_jsonb(NEW)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt']))
  OR NOT (CASE old_state
   WHEN 'DRAFT' THEN NEW.status IN ('DRAFT','CONFIRMED','CANCELLED')
   WHEN 'CONFIRMED' THEN NEW.status IN ('CONFIRMED','IN_PROGRESS','CANCELLED')
   WHEN 'IN_PROGRESS' THEN NEW.status IN ('IN_PROGRESS','READY','CANCELLED')
   WHEN 'READY' THEN NEW.status IN ('COMPLETED','CANCELLED')
   ELSE false END) THEN
  RAISE EXCEPTION 'invalid order transition or immutable snapshot mutation' USING ERRCODE='23514';
 END IF;
 IF NEW.status='CANCELLED' AND (
  public.order_net_paid(NEW."organizationId",NEW.id)>0
  OR EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id AND kind='CONSUMPTION')
 ) THEN RAISE EXCEPTION 'cancellation must not erase a payment or recorded consumption' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_customer_address(),public.validate_customer_address_claim(),
 public.claim_created_customer_address(),public.check_customer_address_claim(),public.validate_order_address_reference() FROM PUBLIC;
COMMIT;
