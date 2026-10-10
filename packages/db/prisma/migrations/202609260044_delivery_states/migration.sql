-- Add delivery tracking without inventing the outcome or courier of historical orders.
BEGIN;
ALTER TABLE "Order" ADD COLUMN "deliveryStatus" text,
 ADD COLUMN "deliveryCourierId" uuid, ADD COLUMN "deliveryCourierName" text,
 ADD CONSTRAINT order_delivery_status CHECK ("deliveryStatus" IN ('NOT_REQUIRED','WAITING_COURIER','ASSIGNED','PICKED_UP','DELIVERING','DELIVERED','FAILED')),
 ADD CONSTRAINT order_delivery_service CHECK ("deliveryStatus" IS NULL OR
  ("serviceType"='DELIVERY' AND "deliveryStatus"<>'NOT_REQUIRED') OR
  ("serviceType"<>'DELIVERY' AND "deliveryStatus"='NOT_REQUIRED')),
 ADD CONSTRAINT order_delivery_courier_pair CHECK (("deliveryCourierId" IS NULL)=("deliveryCourierName" IS NULL)),
 ADD CONSTRAINT order_delivery_courier_state CHECK (
  ("deliveryStatus" IN ('ASSIGNED','PICKED_UP','DELIVERING','DELIVERED') AND "deliveryCourierId" IS NOT NULL) OR
  ("deliveryStatus"='FAILED') OR
  (("deliveryStatus" IS NULL OR "deliveryStatus" IN ('NOT_REQUIRED','WAITING_COURIER')) AND "deliveryCourierId" IS NULL)),
 ADD CONSTRAINT order_delivery_courier_fk FOREIGN KEY ("organizationId","deliveryCourierId") REFERENCES "CompanyUser"("organizationId",id);

CREATE TABLE "DeliveryOperation" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "orderVersion" integer NOT NULL CHECK ("orderVersion">1), "fromStatus" text, "toStatus" text NOT NULL,
 "previousCourierId" uuid, "courierUserId" uuid, "courierName" text,
 "actorUserId" uuid NOT NULL, reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("toStatus" IN ('WAITING_COURIER','ASSIGNED','PICKED_UP','DELIVERING','DELIVERED','FAILED')),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId","requestKey"),
 UNIQUE ("organizationId","orderId","orderVersion"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","courierUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","previousCourierId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE INDEX delivery_operation_history ON "DeliveryOperation"("organizationId","orderId","createdAt");
INSERT INTO "Permission" (key,label,"scopeTypes",delegable) VALUES
 ('delivery.assign','Atribuirea și administrarea livrărilor',ARRAY['LOCATION'],true),
 ('delivery.update','Actualizarea livrărilor atribuite',ARRAY['LOCATION'],true);

CREATE FUNCTION public.initialize_order_delivery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' OR (OLD.status='DRAFT' AND NEW."serviceType" IS DISTINCT FROM OLD."serviceType") THEN
  IF NEW."deliveryCourierId" IS NOT NULL OR NEW."deliveryCourierName" IS NOT NULL THEN
   RAISE EXCEPTION 'delivery assignment requires a confirmed order and an operation' USING ERRCODE='23514';
  END IF;
  NEW."deliveryStatus":=CASE WHEN NEW."serviceType"='DELIVERY' THEN 'WAITING_COURIER' ELSE 'NOT_REQUIRED' END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_initialize_order_delivery BEFORE INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.initialize_order_delivery();

CREATE FUNCTION public.validate_delivery_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; current_status text; courier public."CompanyUser";
BEGIN
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
 IF o.id IS NULL OR o."serviceType"<>'DELIVERY' OR public.effective_order_status(o.status,o."kitchenStatus") IN ('DRAFT','CANCELLED')
  OR NEW."orderVersion" IS DISTINCT FROM o.version+1
  OR EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=o."organizationId" AND "orderId"=o.id AND mode='DEMO') THEN
  RAISE EXCEPTION 'delivery requires a confirmed non-demo delivery order and its next version' USING ERRCODE='23514';
 END IF;
 current_status:=coalesce(o."deliveryStatus",'WAITING_COURIER');
 IF NOT (CASE current_status
  WHEN 'WAITING_COURIER' THEN NEW."toStatus" IN ('ASSIGNED','FAILED')
  WHEN 'ASSIGNED' THEN NEW."toStatus" IN ('ASSIGNED','PICKED_UP','FAILED')
  WHEN 'PICKED_UP' THEN NEW."toStatus" IN ('DELIVERING','FAILED')
  WHEN 'DELIVERING' THEN NEW."toStatus" IN ('DELIVERED','FAILED')
  WHEN 'FAILED' THEN NEW."toStatus"='WAITING_COURIER'
  ELSE false END) THEN
  RAISE EXCEPTION 'invalid delivery transition' USING ERRCODE='23514';
 END IF;
 IF (NEW."toStatus" IN ('FAILED','WAITING_COURIER') OR current_status=NEW."toStatus") AND NEW.reason IS NULL THEN
  RAISE EXCEPTION 'delivery failure, retry and reassignment require a reason' USING ERRCODE='23514';
 END IF;
 IF NEW."toStatus" IN ('PICKED_UP','DELIVERING','DELIVERED') AND
  (public.effective_order_status(o.status,o."kitchenStatus") NOT IN ('READY','COMPLETED') OR o."kitchenStatus"<>'READY') THEN
  RAISE EXCEPTION 'delivery pickup requires a prepared order' USING ERRCODE='23514';
 END IF;
 NEW."fromStatus":=o."deliveryStatus"; NEW."previousCourierId":=o."deliveryCourierId";
 IF NEW."toStatus"='ASSIGNED' THEN
  SELECT * INTO courier FROM public."CompanyUser" WHERE "organizationId"=o."organizationId" AND id=NEW."courierUserId";
  IF courier.id IS NULL OR courier.status<>'ACTIVE'
   OR (NOT courier."isPrimaryAdmin" AND NOT EXISTS (SELECT 1 FROM public."UserLocationAccess"
    WHERE "organizationId"=o."organizationId" AND "locationId"=o."locationId" AND "userId"=courier.id))
   OR (current_status='ASSIGNED' AND NEW."courierUserId" IS NOT DISTINCT FROM o."deliveryCourierId") THEN
   RAISE EXCEPTION 'delivery requires an active distinct courier in the order location' USING ERRCODE='23514';
  END IF;
  NEW."courierName":=courier."displayName";
 ELSIF NEW."toStatus"='WAITING_COURIER' THEN
  NEW."courierUserId":=NULL; NEW."courierName":=NULL;
 ELSE
  NEW."courierUserId":=o."deliveryCourierId"; NEW."courierName":=o."deliveryCourierName";
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_operation_creation BEFORE INSERT ON "DeliveryOperation"
 FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_operation();
CREATE TRIGGER delivery_operation_immutable BEFORE UPDATE OR DELETE ON "DeliveryOperation"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "DeliveryOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryOperation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DeliveryOperation" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DeliveryOperation" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "DeliveryOperation" TO pos_runtime;

CREATE FUNCTION public.check_delivery_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order";
BEGIN
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND id=NEW."orderId";
 IF (o.version,o."deliveryStatus",o."deliveryCourierId",o."deliveryCourierName",o."updatedByUserId")
  IS DISTINCT FROM (NEW."orderVersion",NEW."toStatus",NEW."courierUserId",NEW."courierName",NEW."actorUserId")
  OR NOT EXISTS (SELECT 1 FROM public."OrderStatusEvent" e WHERE e."organizationId"=NEW."organizationId"
   AND e."locationId"=NEW."locationId" AND e."orderId"=NEW."orderId" AND e.kind='DELIVERY'
   AND e."requestKey"=NEW."requestKey" AND e."requestHash"=NEW."requestHash" AND e."orderVersion"=NEW."orderVersion"
   AND e."actorUserId"=NEW."actorUserId" AND e."fromStatus" IS NOT DISTINCT FROM NEW."fromStatus"
   AND e."toStatus"=NEW."toStatus" AND e.reason IS NOT DISTINCT FROM NEW.reason
   AND e.xmin=pg_current_xact_id()::text::xid) THEN
  RAISE EXCEPTION 'delivery operation requires its atomic order state and timeline event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER delivery_operation_consistency AFTER INSERT ON "DeliveryOperation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_delivery_operation();
CREATE FUNCTION public.validate_delivery_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."DeliveryOperation"; op_xmin xid;
BEGIN
 SELECT * INTO op FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 SELECT xmin INTO op_xmin FROM public."DeliveryOperation" WHERE id=op.id;
 IF op.id IS NULL OR op_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR (NEW."orderId",NEW."actorUserId",NEW."requestHash",NEW."orderVersion",NEW."fromStatus",NEW."toStatus",NEW.reason)
   IS DISTINCT FROM (op."orderId",op."actorUserId",op."requestHash",op."orderVersion",op."fromStatus",op."toStatus",op.reason) THEN
  RAISE EXCEPTION 'delivery timeline event must match its atomic command' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER delivery_event_creation BEFORE INSERT ON "OrderStatusEvent" FOR EACH ROW
 WHEN (NEW.kind='DELIVERY') EXECUTE FUNCTION public.validate_delivery_event();

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
  OR (to_jsonb(NEW)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','deliveryStatus','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
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


CREATE FUNCTION public.check_demo_delivery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.mode='DEMO' AND EXISTS (SELECT 1 FROM public."DeliveryOperation"
  WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId") THEN
  RAISE EXCEPTION 'tracked delivery cannot be converted to a demo checkout' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z_checkout_delivery BEFORE INSERT ON "Checkout" FOR EACH ROW EXECUTE FUNCTION public.check_demo_delivery();
REVOKE ALL ON FUNCTION public.initialize_order_delivery(),public.validate_delivery_operation(),
 public.check_delivery_operation(),public.validate_delivery_event(),public.check_demo_delivery() FROM PUBLIC;
COMMIT;
