BEGIN;
CREATE TABLE "Customer" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL,
 "createdLocationId" uuid NOT NULL, "createdByUserId" uuid NOT NULL,
 "privateDataEncrypted" text NOT NULL CHECK (length("privateDataEncrypted") BETWEEN 40 AND 4096 AND "privateDataEncrypted" ~ '^[A-Za-z0-9_-]+$'),
 "phoneLookupHash" text NOT NULL CHECK ("phoneLookupHash" ~ '^[0-9a-f]{64}$'),
 "nameLookupHash" text CHECK ("nameLookupHash" IS NULL OR "nameLookupHash" ~ '^[0-9a-f]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK (version=1),
 "creationRequestKey" uuid NOT NULL,
 "creationRequestHash" text NOT NULL CHECK ("creationRequestHash" ~ '^[0-9a-f]{64}$'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","phoneLookupHash"),
 UNIQUE ("organizationId","creationRequestKey"),
 FOREIGN KEY ("organizationId","createdLocationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "Customer" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "Customer" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "Customer" TO pos_runtime;
CREATE TRIGGER customer_immutable BEFORE UPDATE OR DELETE ON "Customer"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.validate_customer_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  OR NOT EXISTS (SELECT 1 FROM public."Location" l WHERE l."organizationId"=NEW."organizationId"
   AND l.id=NEW."createdLocationId" AND l.status='ACTIVE')
  OR NOT EXISTS (SELECT 1 FROM public."CompanyUser" u
   WHERE u."organizationId"=NEW."organizationId" AND u.id=NEW."createdByUserId" AND u.status='ACTIVE'
    AND (u."isPrimaryAdmin" OR EXISTS (SELECT 1 FROM public."UserLocationAccess" a
     WHERE a."organizationId"=NEW."organizationId" AND a."locationId"=NEW."createdLocationId" AND a."userId"=u.id))) THEN
  RAISE EXCEPTION 'customer creation requires the current scoped actor and active accessible location' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 NEW.version:=1;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_creation_validation BEFORE INSERT ON "Customer"
 FOR EACH ROW EXECUTE FUNCTION public.validate_customer_creation();
ALTER TABLE "Order" ADD COLUMN "customerId" uuid, ADD COLUMN "customerVersionSnapshot" integer,
 ADD CONSTRAINT order_customer_reference_shape CHECK (
  ("customerId" IS NULL AND "customerVersionSnapshot" IS NULL)
  OR ("customerId" IS NOT NULL AND "customerVersionSnapshot">0 AND "customerVersionSnapshot" IS NOT NULL)),
 ADD CONSTRAINT order_customer_reference_fk FOREIGN KEY ("organizationId","customerId") REFERENCES "Customer"("organizationId",id);
CREATE FUNCTION public.validate_order_customer_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."customerId" IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND
  (NEW."customerId",NEW."customerVersionSnapshot",NEW."customerDataEncrypted",NEW."customerNameLookupHash",NEW."customerPhoneLookupHash")
  IS NOT DISTINCT FROM
  (OLD."customerId",OLD."customerVersionSnapshot",OLD."customerDataEncrypted",OLD."customerNameLookupHash",OLD."customerPhoneLookupHash") THEN RETURN NEW; END IF;
 IF NEW."customerDataEncrypted" IS NULL OR NOT EXISTS (
  SELECT 1 FROM public."Customer" c WHERE c."organizationId"=NEW."organizationId" AND c.id=NEW."customerId"
   AND c.version=NEW."customerVersionSnapshot"
   AND (c."phoneLookupHash",c."nameLookupHash") IS NOT DISTINCT FROM (NEW."customerPhoneLookupHash",NEW."customerNameLookupHash")
 ) THEN RAISE EXCEPTION 'order customer reference requires the current matching contact snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_customer_reference_validation BEFORE INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_customer_reference();
INSERT INTO public."Permission" (key,label,"scopeTypes",delegable) VALUES
 ('customers.read','Vizualizarea clienților organizației',ARRAY['ORGANIZATION'],true),
 ('customers.create','Înregistrarea clienților organizației',ARRAY['ORGANIZATION'],true);

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
  OR (to_jsonb(NEW)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
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
COMMIT;
