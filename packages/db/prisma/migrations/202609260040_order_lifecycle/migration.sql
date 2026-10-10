BEGIN;
-- Retain historical OPEN/NEW rows verbatim. New writes use explicit operational states.
ALTER TABLE public."Order" DROP CONSTRAINT "Order_status_check",
 ADD CONSTRAINT "Order_status_check" CHECK (status IN ('DRAFT','OPEN','CONFIRMED','IN_PROGRESS','READY','CANCELLED','COMPLETED'));
ALTER TABLE public."Order" DROP CONSTRAINT "Order_kitchenStatus_check",
 ADD CONSTRAINT "Order_kitchenStatus_check" CHECK ("kitchenStatus" IN ('NOT_SENT','NEW','QUEUED','PREPARING','PARTIALLY_READY','READY'));
ALTER TABLE public."KitchenTicket" DROP CONSTRAINT "KitchenTicket_status_check",
 ADD CONSTRAINT "KitchenTicket_status_check" CHECK (status IN ('NEW','QUEUED','PREPARING','PARTIALLY_READY','READY','CANCELLED'));
ALTER TABLE public."KitchenTicket" ALTER COLUMN status SET DEFAULT 'QUEUED';
ALTER TABLE public."OrderStatusEvent"
 ADD COLUMN reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
 ADD COLUMN "requestKey" uuid,
 ADD COLUMN "requestHash" text,
 ADD CONSTRAINT order_event_command_pair CHECK (("requestKey" IS NULL AND "requestHash" IS NULL)
  OR ("requestKey" IS NOT NULL AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[a-f0-9]{64}$')),
 ADD CONSTRAINT order_event_request_unique UNIQUE ("organizationId","locationId","requestKey");
INSERT INTO public."Permission" (key,label,"scopeTypes",delegable)
 VALUES ('orders.cancel','Anularea comenzilor confirmate',ARRAY['LOCATION'],true);

CREATE FUNCTION public.effective_order_status(status_ text,kitchen_ text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT CASE WHEN status_='OPEN' THEN CASE kitchen_
  WHEN 'READY' THEN 'READY' WHEN 'PREPARING' THEN 'IN_PROGRESS' WHEN 'PARTIALLY_READY' THEN 'IN_PROGRESS'
  ELSE 'CONFIRMED' END ELSE status_ END
$$;
CREATE FUNCTION public.effective_kitchen_status(status_ text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$ SELECT CASE WHEN status_='NEW' THEN 'QUEUED' ELSE status_ END $$;
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
 IF NEW.version<>OLD.version+1 OR NEW.status='OPEN' OR NEW."kitchenStatus"='NEW'
  OR (to_jsonb(NEW)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
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
  EXISTS (SELECT 1 FROM public."Payment" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id)
  OR EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id AND kind='CONSUMPTION')
 ) THEN RAISE EXCEPTION 'cancellation must not erase a payment or recorded consumption' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.protect_kitchen_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; previous_status text;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF order_row.status NOT IN ('DRAFT','CONFIRMED') OR order_row."kitchenStatus"<>'NOT_SENT' OR NEW.status<>'QUEUED'
   OR NEW.version<>1 OR NEW.revision<>1 OR NEW."orderVersion"<>order_row.version+1 THEN
   RAISE EXCEPTION 'initial kitchen snapshot requires an unsent draft or confirmed order and its next version' USING ERRCODE='23514';
  END IF;
 ELSE
  previous_status:=public.effective_kitchen_status(OLD.status);
  IF NEW.version<>OLD.version+1 OR NEW."updatedByUserId" IS NULL
   OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt'])
   OR NOT ((previous_status='QUEUED' AND NEW.status IN ('PREPARING','CANCELLED'))
    OR (previous_status='PREPARING' AND NEW.status IN ('PARTIALLY_READY','READY','CANCELLED'))
    OR (previous_status='PARTIALLY_READY' AND NEW.status IN ('READY','CANCELLED'))
    OR (previous_status='READY' AND NEW.status='CANCELLED'))
   OR public.effective_order_status(order_row.status,order_row."kitchenStatus") NOT IN ('CONFIRMED','IN_PROGRESS','READY') THEN
   RAISE EXCEPTION 'invalid kitchen transition or immutable ticket mutation' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_order_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed jsonb; order_id uuid; org_id uuid; order_row public."Order";
 ticket_row public."KitchenTicket"; item_total numeric; item_count bigint; ticket_count bigint; state_ text; kitchen_ text;
BEGIN
 changed:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 org_id:=(changed->>'organizationId')::uuid;
 IF TG_TABLE_NAME='Order' THEN order_id:=(changed->>'id')::uuid;
 ELSIF TG_TABLE_NAME='KitchenTicketItem' THEN
  SELECT "orderId" INTO order_id FROM public."KitchenTicket" WHERE id=(changed->>'ticketId')::uuid AND "organizationId"=org_id;
 ELSE order_id:=(changed->>'orderId')::uuid; END IF;
 SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
 SELECT coalesce(sum("lineTotal"),0),count(*) INTO item_total,item_count FROM public."OrderItem" WHERE "organizationId"=org_id AND "orderId"=order_id;
 IF order_row.total IS DISTINCT FROM item_total THEN
  RAISE EXCEPTION 'order total must equal rounded line totals' USING ERRCODE='23514';
 END IF;
 state_:=public.effective_order_status(order_row.status,order_row."kitchenStatus");
 kitchen_:=public.effective_kitchen_status(order_row."kitchenStatus");
 IF (state_ NOT IN ('DRAFT','CANCELLED') AND item_count=0)
  OR NOT (CASE state_
   WHEN 'DRAFT' THEN kitchen_='NOT_SENT'
   WHEN 'CONFIRMED' THEN kitchen_ IN ('NOT_SENT','QUEUED')
   WHEN 'IN_PROGRESS' THEN kitchen_ IN ('PREPARING','PARTIALLY_READY')
   WHEN 'READY' THEN kitchen_='READY'
   WHEN 'COMPLETED' THEN kitchen_='READY'
   WHEN 'CANCELLED' THEN true ELSE false END) THEN
  RAISE EXCEPTION 'order stage must agree with its kitchen progress and nonempty contents' USING ERRCODE='23514';
 END IF;
 SELECT * INTO ticket_row FROM public."KitchenTicket" WHERE "organizationId"=org_id AND "orderId"=order_id;
 IF ticket_row.id IS NULL THEN
  IF state_ NOT IN ('DRAFT','CONFIRMED','CANCELLED') OR kitchen_<>'NOT_SENT' THEN
   RAISE EXCEPTION 'sent order requires a kitchen snapshot' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT count(*) INTO ticket_count FROM public."KitchenTicketItem" WHERE "organizationId"=org_id AND "ticketId"=ticket_row.id;
  IF state_='DRAFT' OR item_count=0 OR ticket_count<>item_count OR ticket_row."orderVersion">order_row.version
   OR (state_<>'CANCELLED' AND kitchen_<>public.effective_kitchen_status(ticket_row.status))
   OR ((ticket_row.status='CANCELLED')<>(state_='CANCELLED'))
   OR EXISTS (SELECT 1 FROM public."KitchenTicketItem" ki JOIN public."OrderItem" oi
    ON oi.id=ki."orderItemId" AND oi."organizationId"=ki."organizationId"
    WHERE ki."organizationId"=org_id AND ki."ticketId"=ticket_row.id
     AND (ki.position,ki."productName",ki."productSku",ki.quantity,ki.note)
      IS DISTINCT FROM (oi.position,oi."productName",oi."productSku",oi.quantity,oi.note)) THEN
   RAISE EXCEPTION 'kitchen snapshot must be complete and consistent with its order' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_inventory_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; ticket_xmin xid;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  SELECT xmin INTO ticket_xmin FROM public."KitchenTicket" WHERE "orderId"=NEW."orderId"
   AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
   AND status='QUEUED' AND revision=1 AND "orderVersion"=order_row.version;
  IF NEW.status<>'PENDING' OR order_row.status IS DISTINCT FROM 'CONFIRMED'
   OR ticket_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId") THEN
   RAISE EXCEPTION 'reservation requires a new kitchen send without existing consumption' USING ERRCODE='23514';
  END IF;
 ELSE
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('CONSUMED','RELEASED')
   OR (to_jsonb(NEW)-ARRAY['status','resolvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolvedAt'])
   OR (NEW.status='CONSUMED' AND order_row.status IS DISTINCT FROM 'COMPLETED')
   OR (NEW.status='RELEASED' AND order_row.status IS DISTINCT FROM 'CANCELLED') THEN
   RAISE EXCEPTION 'reservation resolves exactly once with its order' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.check_order_reservation_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; reservation public."InventoryReservation"; historical boolean; state_ text;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
 SELECT * INTO reservation FROM public."InventoryReservation" WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId";
 state_:=public.effective_order_status(order_row.status,order_row."kitchenStatus");
 IF reservation.id IS NOT NULL THEN
  IF (state_ IN ('CONFIRMED','IN_PROGRESS','READY') AND reservation.status<>'PENDING')
   OR (state_='COMPLETED' AND reservation.status<>'CONSUMED')
   OR (state_='CANCELLED' AND reservation.status<>'RELEASED') THEN
   RAISE EXCEPTION 'order state requires matching inventory reservation resolution' USING ERRCODE='23514';
  END IF;
 ELSIF order_row."kitchenStatus"<>'NOT_SENT' THEN
  SELECT EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId" AND kind='CONSUMPTION')
   OR EXISTS (SELECT 1 FROM public."InventoryLegacyOrder" WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId") INTO historical;
  IF NOT historical THEN
   RAISE EXCEPTION 'sent and completed orders require inventory reservation or immutable historical evidence' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_checkout_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; company_name text; location_name text; location_code text; cashier_name text;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId" AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF public.effective_order_status(order_row.status,order_row."kitchenStatus") IS DISTINCT FROM 'READY'
  OR NEW.total IS DISTINCT FROM order_row.total OR NEW.currency IS DISTINCT FROM order_row.currency THEN
  RAISE EXCEPTION 'checkout requires a ready order and its exact total' USING ERRCODE='23514';
 END IF;
 SELECT name INTO company_name FROM public."Organization" WHERE id=NEW."organizationId";
 SELECT name,code INTO location_name,location_code FROM public."Location" WHERE id=NEW."locationId" AND "organizationId"=NEW."organizationId";
 SELECT "displayName" INTO cashier_name FROM public."CompanyUser" WHERE id=NEW."createdByUserId" AND "organizationId"=NEW."organizationId";
 IF (NEW."companyName",NEW."locationName",NEW."locationCode",NEW."cashierName") IS DISTINCT FROM (company_name,location_name,location_code,cashier_name) THEN
  RAISE EXCEPTION 'receipt snapshots must match the organization location and cashier' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.check_order_cancel_reason() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='CANCELLED' AND OLD.status NOT IN ('DRAFT','CANCELLED') AND NOT EXISTS (
  SELECT 1 FROM public."OrderStatusEvent" e WHERE e."organizationId"=NEW."organizationId"
   AND e."locationId"=NEW."locationId" AND e."orderId"=NEW.id AND e.kind='ORDER'
   AND e."fromStatus"=public.effective_order_status(OLD.status,OLD."kitchenStatus") AND e."toStatus"='CANCELLED'
   AND e."actorUserId"=NEW."updatedByUserId" AND e.reason IS NOT NULL AND e.xmin=pg_current_xact_id()::text::xid
 ) THEN RAISE EXCEPTION 'confirmed cancellation requires an atomic actor and reason event' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_cancel_reason AFTER UPDATE ON public."Order"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_cancel_reason();
REVOKE ALL ON FUNCTION public.effective_order_status(text,text),public.effective_kitchen_status(text),public.check_order_cancel_reason() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_order_status(text,text),public.effective_kitchen_status(text) TO pos_runtime;
COMMIT;
