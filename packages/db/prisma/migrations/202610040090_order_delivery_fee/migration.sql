BEGIN;
-- New snapshots only. Existing orders keep their historical zero delivery fee.
ALTER TABLE "Order" ADD COLUMN "deliveryFee" numeric(18,2) NOT NULL DEFAULT 0 CHECK("deliveryFee">=0 AND "deliveryFee"<'Infinity'::numeric),
 ADD COLUMN "deliveryFeeCommandId" uuid;
CREATE TABLE "OrderDeliveryFeeCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer,
 "zoneId" uuid, "zoneVersion" integer, "zoneCommandId" uuid, destination jsonb,
 subtotal numeric(18,2), fee numeric(18,2), total numeric(18,2), "deliveryAddressHash" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","locationId","orderId",id),
 FOREIGN KEY("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","locationId","zoneId","zoneCommandId") REFERENCES "DeliveryZoneCommand"("organizationId","locationId","zoneId",id),
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL AND "resultVersion" IS NULL
   AND "zoneId" IS NULL AND "zoneVersion" IS NULL AND "zoneCommandId" IS NULL AND destination IS NULL
   AND subtotal IS NULL AND fee IS NULL AND total IS NULL AND "deliveryAddressHash" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash"~'^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion">0 AND "resultVersion" IS NOT NULL AND "resultVersion"::bigint="expectedVersion"::bigint+1
   AND "zoneId" IS NOT NULL AND "zoneVersion" IS NOT NULL AND "zoneVersion">0 AND "zoneCommandId" IS NOT NULL
   AND destination IS NOT NULL AND public.delivery_coordinate_valid(destination) IS TRUE
   AND (destination->>'latitude')::numeric=round((destination->>'latitude')::numeric,6)
   AND (destination->>'longitude')::numeric=round((destination->>'longitude')::numeric,6)
   AND subtotal IS NOT NULL AND subtotal>=0 AND subtotal<'Infinity'::numeric
   AND fee IS NOT NULL AND fee>=0 AND fee<'Infinity'::numeric AND total IS NOT NULL AND total=subtotal+fee
   AND "deliveryAddressHash" IS NOT NULL AND "deliveryAddressHash"~'^[0-9a-f]{64}$'))
);
CREATE UNIQUE INDEX order_delivery_fee_version ON "OrderDeliveryFeeCommand"("organizationId","orderId","resultVersion") WHERE status='SUCCEEDED';
ALTER TABLE "Order" ADD FOREIGN KEY("organizationId","locationId",id,"deliveryFeeCommandId")
 REFERENCES "OrderDeliveryFeeCommand"("organizationId","locationId","orderId",id);
ALTER TABLE "OrderDeliveryFeeCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderDeliveryFeeCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "OrderDeliveryFeeCommand" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "OrderDeliveryFeeCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "OrderDeliveryFeeCommand" TO pos_runtime;
GRANT UPDATE("deliveryFee","deliveryFeeCommandId") ON "Order" TO pos_runtime;
CREATE TRIGGER order_delivery_fee_command_immutable BEFORE UPDATE OR DELETE ON "OrderDeliveryFeeCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.delivery_shape_contains(shape jsonb,p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE points jsonb; a jsonb; b jsonb; n integer; i integer; inside_ boolean:=false; h float8;
BEGIN
 IF public.delivery_coordinate_valid(p) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF shape->>'type'='RADIUS' THEN
  a:=shape->'center';
  h:=power(sin(radians((p->>'latitude')::float8-(a->>'latitude')::float8)/2),2)
    +cos(radians((a->>'latitude')::float8))*cos(radians((p->>'latitude')::float8))
     *power(sin(radians((p->>'longitude')::float8-(a->>'longitude')::float8)/2),2);
  RETURN 2*6371008.8*asin(sqrt(least(1,greatest(0,h))))<=(shape->>'radiusMeters')::float8+0.000001;
 END IF;
 points:=shape->'vertices'; n:=jsonb_array_length(points);
 FOR i IN 0..n-1 LOOP
  a:=points->((i+n-1)%n); b:=points->i;
  IF public.delivery_on_segment(a,b,p) THEN RETURN true; END IF;
  IF ((a->>'latitude')::float8>(p->>'latitude')::float8)<>((b->>'latitude')::float8>(p->>'latitude')::float8) THEN
   IF (p->>'longitude')::float8<((b->>'longitude')::float8-(a->>'longitude')::float8)
    *((p->>'latitude')::float8-(a->>'latitude')::float8)/((b->>'latitude')::float8-(a->>'latitude')::float8)+(a->>'longitude')::float8 THEN inside_:=NOT inside_; END IF;
  END IF;
 END LOOP;
 RETURN inside_;
END $$;
CREATE FUNCTION public.delivery_zone_open(hours jsonb,instant timestamptz,timezone_ text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_array_length(hours)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(hours) w
  WHERE (w->>'weekday')::int=extract(isodow FROM instant AT TIME ZONE timezone_)::int
   AND (w->>'startMinute')::int<=extract(hour FROM instant AT TIME ZONE timezone_)::int*60+extract(minute FROM instant AT TIME ZONE timezone_)::int
   AND (w->>'endMinute')::int>extract(hour FROM instant AT TIME ZONE timezone_)::int*60+extract(minute FROM instant AT TIME ZONE timezone_)::int)
$$;
CREATE FUNCTION public.validate_order_delivery_fee_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_ public."Order"; zone_ public."DeliveryZone"; location_ public."Location"; subtotal_ numeric; fee_ numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'delivery fee requires active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO order_ FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
 IF order_.id IS NULL THEN RAISE EXCEPTION 'delivery fee order mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  IF order_.status<>'DRAFT' OR order_."serviceType"<>'DELIVERY' OR order_."deliveryAddressHash" IS NULL
   OR NEW."expectedVersion" IS DISTINCT FROM order_.version OR order_.version=2147483647 THEN
   RAISE EXCEPTION 'delivery fee requires current delivery draft and address' USING ERRCODE='23514'; END IF;
  IF public.delivery_coordinate_valid(NEW.destination) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'delivery fee destination invalid' USING ERRCODE='23514'; END IF;
  SELECT * INTO location_ FROM public."Location" WHERE "organizationId"=NEW."organizationId" AND id=NEW."locationId";
  SELECT * INTO zone_ FROM public."DeliveryZone" z WHERE z."organizationId"=NEW."organizationId" AND z."locationId"=NEW."locationId"
   AND z.status='ACTIVE' AND public.delivery_shape_contains(z.profile->'shape',NEW.destination)
   AND public.delivery_zone_open(z.profile->'activeHours',CURRENT_TIMESTAMP,location_.timezone)
   ORDER BY (z.profile->>'priority')::int,z.id LIMIT 1;
  IF zone_.id IS NULL OR zone_.id IS DISTINCT FROM NEW."zoneId" OR zone_.version IS DISTINCT FROM NEW."zoneVersion" THEN
   RAISE EXCEPTION 'delivery fee zone unavailable or quote stale' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum("lineTotal"),0) INTO subtotal_ FROM public."OrderItem" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId";
  IF NEW.subtotal IS DISTINCT FROM subtotal_ OR subtotal_<(zone_.profile->>'minimumOrder')::numeric THEN
   RAISE EXCEPTION 'delivery fee subtotal or minimum mismatch' USING ERRCODE='23514'; END IF;
  fee_:=CASE WHEN zone_.profile->'freeDeliveryFrom'<>'null'::jsonb AND subtotal_>=(zone_.profile->>'freeDeliveryFrom')::numeric THEN 0 ELSE (zone_.profile->>'deliveryFee')::numeric END;
  IF NEW.fee IS DISTINCT FROM fee_ OR NEW.total IS DISTINCT FROM subtotal_+fee_ THEN
   RAISE EXCEPTION 'delivery fee quote amount mismatch' USING ERRCODE='23514'; END IF;
  IF order_."deliveryFeeCommandId" IS NOT NULL AND EXISTS(SELECT 1 FROM public."OrderDeliveryFeeCommand" c
   WHERE c.id=order_."deliveryFeeCommandId" AND c."zoneCommandId"=zone_."lastCommandId" AND c.destination=NEW.destination
    AND c.subtotal=subtotal_ AND c.fee=fee_ AND c."deliveryAddressHash"=order_."deliveryAddressHash") THEN
   RAISE EXCEPTION 'delivery fee has no changes' USING ERRCODE='23514'; END IF;
  NEW."zoneCommandId":=zone_."lastCommandId"; NEW."deliveryAddressHash":=order_."deliveryAddressHash";
  NEW."resultVersion":=order_.version+1;
 END IF;
 NEW."createdAt":=CURRENT_TIMESTAMP; RETURN NEW;
END $$;
CREATE TRIGGER order_delivery_fee_command_validation BEFORE INSERT ON "OrderDeliveryFeeCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_delivery_fee_command();
CREATE FUNCTION public.protect_order_delivery_fee() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command_ public."OrderDeliveryFeeCommand"; command_xmin xid; subtotal_ numeric; invalidated_ boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."deliveryFee"<>0 OR NEW."deliveryFeeCommandId" IS NOT NULL THEN RAISE EXCEPTION 'new drafts have no applied delivery fee' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."deliveryFeeCommandId" IS DISTINCT FROM OLD."deliveryFeeCommandId" AND NEW."deliveryFeeCommandId" IS NOT NULL THEN
  SELECT * INTO command_ FROM public."OrderDeliveryFeeCommand" WHERE id=NEW."deliveryFeeCommandId";
  SELECT xmin INTO command_xmin FROM public."OrderDeliveryFeeCommand" WHERE id=NEW."deliveryFeeCommandId";
  IF command_.id IS NULL OR command_.status<>'SUCCEEDED' OR command_."organizationId"<>NEW."organizationId" OR command_."locationId"<>NEW."locationId" OR command_."orderId"<>NEW.id
   OR command_xmin::text<>pg_current_xact_id()::text OR OLD.status<>'DRAFT' OR NEW.status<>'DRAFT'
   OR command_."expectedVersion" IS DISTINCT FROM OLD.version OR command_."resultVersion" IS DISTINCT FROM NEW.version
   OR NEW."updatedByUserId" IS DISTINCT FROM command_."actorUserId" OR NEW."deliveryFee" IS DISTINCT FROM command_.fee OR NEW.total IS DISTINCT FROM command_.total
   OR (to_jsonb(NEW)-ARRAY['deliveryFee','deliveryFeeCommandId','total','version','updatedAt','updatedByUserId']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['deliveryFee','deliveryFeeCommandId','total','version','updatedAt','updatedByUserId']) THEN
   RAISE EXCEPTION 'delivery fee change requires its current transaction command' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD."deliveryFeeCommandId" IS NOT NULL THEN
   SELECT * INTO command_ FROM public."OrderDeliveryFeeCommand" WHERE id=OLD."deliveryFeeCommandId";
   SELECT coalesce(sum("lineTotal"),0) INTO subtotal_ FROM public."OrderItem" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id;
   invalidated_:=NEW."serviceType"<>'DELIVERY' OR NEW."deliveryAddressHash" IS DISTINCT FROM command_."deliveryAddressHash" OR subtotal_ IS DISTINCT FROM command_.subtotal;
   IF OLD.status='DRAFT' AND invalidated_ THEN
    IF NEW."deliveryFeeCommandId" IS NOT NULL OR NEW."deliveryFee"<>0 THEN RAISE EXCEPTION 'changed draft must invalidate its delivery fee' USING ERRCODE='23514'; END IF;
   ELSIF NEW."deliveryFeeCommandId" IS DISTINCT FROM OLD."deliveryFeeCommandId" OR NEW."deliveryFee" IS DISTINCT FROM OLD."deliveryFee" THEN
    RAISE EXCEPTION 'delivery fee snapshot cannot be removed or forged' USING ERRCODE='23514';
   END IF;
  ELSIF NEW."deliveryFee"<>0 THEN RAISE EXCEPTION 'delivery fee requires a snapshot' USING ERRCODE='23514'; END IF;
 END IF;
 IF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','CANCELLED') AND NEW."serviceType"='DELIVERY' AND NEW."deliveryFeeCommandId" IS NULL
  AND EXISTS(SELECT 1 FROM public."DeliveryZone" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId") THEN
  RAISE EXCEPTION 'delivery draft requires confirmed zone pricing before sending' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_delivery_fee_protection BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION public.protect_order_delivery_fee();
CREATE FUNCTION public.apply_order_delivery_fee_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  UPDATE public."Order" SET "deliveryFee"=NEW.fee,"deliveryFeeCommandId"=NEW.id,total=NEW.total,
   version=NEW."resultVersion","updatedByUserId"=NEW."actorUserId","updatedAt"=NEW."createdAt"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_delivery_fee_command_application AFTER INSERT ON "OrderDeliveryFeeCommand" FOR EACH ROW EXECUTE FUNCTION public.apply_order_delivery_fee_command();
REVOKE ALL ON FUNCTION public.delivery_shape_contains(jsonb,jsonb),public.delivery_zone_open(jsonb,timestamptz,text),public.validate_order_delivery_fee_command(),public.protect_order_delivery_fee(),public.apply_order_delivery_fee_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_shape_contains(jsonb,jsonb),public.delivery_zone_open(jsonb,timestamptz,text) TO pos_runtime;

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
  OR (to_jsonb(NEW)-ARRAY['deliveryFee','deliveryFeeCommandId','status','deliveryStatus','serviceType','tableLabel','notes','deliveryAddressEncrypted','deliveryAddressHash','customerAddressId','customerAddressVersionSnapshot','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deliveryFee','deliveryFeeCommandId','status','deliveryStatus','serviceType','tableLabel','notes','deliveryAddressEncrypted','deliveryAddressHash','customerAddressId','customerAddressVersionSnapshot','customerId','customerVersionSnapshot','customerDataEncrypted','customerNameLookupHash','customerPhoneLookupHash','total','version','kitchenStatus','updatedByUserId','updatedAt'])
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
CREATE OR REPLACE FUNCTION public.check_order_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed jsonb; order_id uuid; org_id uuid; order_row public."Order";
 ticket_row public."KitchenTicket"; packing public."PackingSession"; item_total numeric; item_count bigint; ticket_count bigint; state_ text; kitchen_ text;
BEGIN
 changed:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 org_id:=(changed->>'organizationId')::uuid;
 IF TG_TABLE_NAME='Order' THEN order_id:=(changed->>'id')::uuid;
 ELSIF TG_TABLE_NAME='KitchenTicketItem' THEN
  SELECT "orderId" INTO order_id FROM public."KitchenTicket" WHERE id=(changed->>'ticketId')::uuid AND "organizationId"=org_id;
 ELSE order_id:=(changed->>'orderId')::uuid; END IF;
 SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
 SELECT coalesce(sum("lineTotal"),0),count(*) INTO item_total,item_count FROM public."OrderItem" WHERE "organizationId"=org_id AND "orderId"=order_id;
 IF order_row.total IS DISTINCT FROM item_total+order_row."deliveryFee" THEN
  RAISE EXCEPTION 'order total must equal rounded line totals plus snapshotted delivery fee' USING ERRCODE='23514';
 END IF;
 SELECT * INTO packing FROM public."PackingSession" WHERE "organizationId"=org_id AND "orderId"=order_id;
 state_:=public.effective_order_status(order_row.status,order_row."kitchenStatus");
 kitchen_:=public.effective_kitchen_status(order_row."kitchenStatus");
 IF (state_ NOT IN ('DRAFT','CANCELLED') AND item_count=0)
  OR NOT (CASE state_
   WHEN 'DRAFT' THEN kitchen_='NOT_SENT'
   WHEN 'CONFIRMED' THEN kitchen_ IN ('NOT_SENT','QUEUED')
   WHEN 'IN_PROGRESS' THEN kitchen_ IN ('PREPARING','PARTIALLY_READY')
    OR (kitchen_='READY' AND coalesce(packing."handoverRequired",false) AND packing.status IN ('WAITING','PACKING'))
   WHEN 'READY' THEN kitchen_='READY' AND (packing.id IS NULL OR NOT packing."handoverRequired" OR packing.status='READY')
   WHEN 'COMPLETED' THEN kitchen_='READY' AND (packing.id IS NULL OR NOT packing."handoverRequired" OR packing.status='READY')
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

COMMIT;
