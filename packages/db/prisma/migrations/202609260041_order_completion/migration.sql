-- Independent operational completion. Existing financial/history rows remain unchanged.
BEGIN;
ALTER TABLE "OrderStatusEvent" ADD COLUMN "orderVersion" integer CHECK ("orderVersion">0);
CREATE UNIQUE INDEX order_operational_completion_unique ON "OrderStatusEvent"("organizationId","orderId")
 WHERE kind='ORDER' AND "toStatus"='COMPLETED' AND "requestKey" IS NOT NULL;

INSERT INTO "Permission" (key,label,"scopeTypes",delegable)
 VALUES ('orders.complete','Finalizarea operațională a comenzilor',ARRAY['LOCATION'],true);

CREATE FUNCTION public.validate_operational_completion_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; order_xmin xid;
BEGIN
 SELECT o.* INTO order_row FROM public."Order" o
  WHERE o.id=NEW."orderId" AND o."organizationId"=NEW."organizationId"
    AND o."locationId"=NEW."locationId" FOR UPDATE;
 SELECT xmin INTO order_xmin FROM public."Order" WHERE id=order_row.id;
 IF order_row.status IS DISTINCT FROM 'COMPLETED' OR order_row."kitchenStatus" IS DISTINCT FROM 'READY'
  OR NEW."fromStatus" IS DISTINCT FROM 'READY' OR NEW."orderVersion" IS DISTINCT FROM order_row.version
  OR NEW."actorUserId" IS DISTINCT FROM order_row."updatedByUserId"
  OR order_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId") THEN
  RAISE EXCEPTION 'operational completion event requires the atomic order version and actor without checkout' USING ERRCODE='23514';
 END IF;
 NEW."createdAt" := statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER operational_completion_event BEFORE INSERT ON "OrderStatusEvent"
 FOR EACH ROW WHEN (NEW.kind='ORDER' AND NEW."toStatus"='COMPLETED' AND NEW."requestKey" IS NOT NULL)
 EXECUTE FUNCTION public.validate_operational_completion_event();
REVOKE ALL ON FUNCTION public.validate_operational_completion_event() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.check_checkout_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_id uuid; org_id uuid; order_row public."Order";
  checkout_row public."Checkout"; payment_row public."Payment";
BEGIN
  org_id := NEW."organizationId";
  IF TG_TABLE_NAME='Order' THEN order_id := NEW.id;
  ELSE order_id := NEW."orderId";
  END IF;
  SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
  SELECT * INTO checkout_row FROM public."Checkout" WHERE "orderId"=order_id AND "organizationId"=org_id;
  IF checkout_row.id IS NULL THEN
    IF order_row.status='COMPLETED' AND NOT EXISTS (
      SELECT 1 FROM public."OrderStatusEvent" e
      WHERE e."organizationId"=org_id AND e."locationId"=order_row."locationId" AND e."orderId"=order_id
        AND e.kind='ORDER' AND e."fromStatus"='READY' AND e."toStatus"='COMPLETED'
        AND e."requestKey" IS NOT NULL AND e."orderVersion"=order_row.version
        AND e."actorUserId"=order_row."updatedByUserId"
    ) THEN
      RAISE EXCEPTION 'completion requires an immutable checkout or operational completion event' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  IF order_row.status IS DISTINCT FROM 'COMPLETED' OR order_row."kitchenStatus" IS DISTINCT FROM 'READY'
    OR checkout_row.total IS DISTINCT FROM order_row.total OR checkout_row.currency IS DISTINCT FROM order_row.currency
    OR checkout_row."locationId" IS DISTINCT FROM order_row."locationId" THEN
    RAISE EXCEPTION 'checkout and order completion must commit together' USING ERRCODE='23514';
  END IF;
  SELECT * INTO payment_row FROM public."Payment"
    WHERE "checkoutId"=checkout_row.id AND "organizationId"=org_id;
  IF (checkout_row.mode='DEMO' AND payment_row.id IS NOT NULL)
    OR (checkout_row.mode='MANUAL' AND payment_row.id IS NULL)
    OR (payment_row.id IS NOT NULL AND
      (payment_row."orderId",payment_row."locationId",payment_row.amount,payment_row.currency,payment_row.method,payment_row."confirmedByUserId")
      IS DISTINCT FROM
      (checkout_row."orderId",checkout_row."locationId",checkout_row.total,checkout_row.currency,checkout_row.method,checkout_row."createdByUserId")) THEN
    RAISE EXCEPTION 'demo has no payment and manual checkout has one exact payment' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_inventory_document() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actor_name text; order_row public."Order"; ticket_xmin xid;
BEGIN
  SELECT "displayName" INTO actor_name FROM public."CompanyUser"
    WHERE id=NEW."createdByUserId" AND "organizationId"=NEW."organizationId";
  IF NEW."actorName" IS DISTINCT FROM actor_name THEN
    RAISE EXCEPTION 'inventory actor snapshot must match its tenant identity' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='CONSUMPTION' THEN
    SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
      AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
    SELECT xmin INTO ticket_xmin FROM public."Checkout" WHERE "orderId"=NEW."orderId"
      AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
    IF order_row.status IS DISTINCT FROM 'COMPLETED'
      OR (ticket_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid AND NOT EXISTS (
        SELECT 1 FROM public."OrderStatusEvent" e
        WHERE e."organizationId"=NEW."organizationId" AND e."locationId"=NEW."locationId"
          AND e."orderId"=NEW."orderId" AND e.kind='ORDER' AND e."toStatus"='COMPLETED'
          AND e."orderVersion"=order_row.version AND e."actorUserId"=NEW."createdByUserId"
          AND e."requestKey"=NEW."requestKey" AND e."requestHash"=NEW."requestHash"
          AND e.xmin=pg_current_xact_id()::text::xid
      ))
      OR NOT EXISTS (SELECT 1 FROM public."InventoryReservation" WHERE "orderId"=NEW."orderId"
       AND "organizationId"=NEW."organizationId" AND status='PENDING') THEN
      RAISE EXCEPTION 'consumption requires pending reservation and atomic completion' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
