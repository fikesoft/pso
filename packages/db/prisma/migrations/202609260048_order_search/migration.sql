BEGIN;
ALTER TABLE "Order"
 ADD COLUMN "customerDataEncrypted" text,
 ADD COLUMN "customerNameLookupHash" text,
 ADD COLUMN "customerPhoneLookupHash" text,
 ADD CONSTRAINT order_customer_snapshot_shape CHECK (
  ("customerDataEncrypted" IS NULL AND "customerNameLookupHash" IS NULL AND "customerPhoneLookupHash" IS NULL)
  OR ("customerDataEncrypted" IS NOT NULL AND length("customerDataEncrypted") BETWEEN 40 AND 4096
   AND "customerDataEncrypted" ~ '^[A-Za-z0-9_-]+$'
   AND ("customerNameLookupHash" IS NOT NULL OR "customerPhoneLookupHash" IS NOT NULL)
   AND ("customerNameLookupHash" IS NULL OR "customerNameLookupHash" ~ '^[0-9a-f]{64}$')
   AND ("customerPhoneLookupHash" IS NULL OR "customerPhoneLookupHash" ~ '^[0-9a-f]{64}$'))
 );
CREATE INDEX "Order_organizationId_locationId_customerNameLookupHash_number_idx"
 ON "Order" ("organizationId","locationId","customerNameLookupHash",number);
CREATE INDEX "Order_organizationId_locationId_customerPhoneLookupHash_number_idx"
 ON "Order" ("organizationId","locationId","customerPhoneLookupHash",number);
CREATE INDEX "Order_organizationId_locationId_createdByUserId_number_idx"
 ON "Order" ("organizationId","locationId","createdByUserId",number);
CREATE INDEX "Order_organizationId_locationId_createdAt_idx"
 ON "Order" ("organizationId","locationId","createdAt");

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
  OR (to_jsonb(NEW)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
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
