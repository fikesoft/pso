-- Existing CONSUMPTION documents are retained verbatim. No retroactive reservation/backfill.
BEGIN;
CREATE TABLE "InventoryReservation" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONSUMED','RELEASED')),
 "createdByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "resolvedAt" timestamptz(3),
 CHECK ((status='PENDING')=("resolvedAt" IS NULL)),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","orderId"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "InventoryReservationLine" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "reservationId" uuid NOT NULL,
 "inventoryItemId" uuid NOT NULL,
 "orderItemId" uuid NOT NULL,
 "recipeComponentId" uuid NOT NULL,
 quantity numeric(18,6) NOT NULL CHECK (quantity>0 AND quantity<'Infinity'::numeric),
 "itemName" text NOT NULL, "itemSku" text NOT NULL,
 unit text NOT NULL CHECK (unit IN ('G','ML','PCS')),
 "productName" text NOT NULL,
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","reservationId","orderItemId","recipeComponentId"),
 FOREIGN KEY ("organizationId","locationId","reservationId") REFERENCES "InventoryReservation"("organizationId","locationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","inventoryItemId") REFERENCES "InventoryItem"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","locationId","orderItemId") REFERENCES "OrderItem"("organizationId","locationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","recipeComponentId") REFERENCES "RecipeComponent"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "InventoryReservationLine_organizationId_locationId_inventoryItemId_idx"
 ON "InventoryReservationLine"("organizationId","locationId","inventoryItemId");
CREATE FUNCTION public.validate_inventory_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; ticket_xmin xid;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
 AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  SELECT xmin INTO ticket_xmin FROM public."KitchenTicket" WHERE "orderId"=NEW."orderId"
   AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
   AND status='NEW' AND revision=1 AND "orderVersion"=order_row.version;
  IF NEW.status<>'PENDING' OR order_row.status IS DISTINCT FROM 'OPEN'
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
CREATE TRIGGER reservation_write BEFORE INSERT OR UPDATE ON "InventoryReservation"
 FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_reservation();
CREATE TRIGGER reservation_no_delete BEFORE DELETE ON "InventoryReservation"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.validate_inventory_reservation_line() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE reservation public."InventoryReservation"; header_xmin xid; line public."OrderItem";
 component public."RecipeComponent"; recipe public."RecipeVersion"; item public."InventoryItem"; service_type text;
BEGIN
 SELECT * INTO reservation FROM public."InventoryReservation" WHERE id=NEW."reservationId" AND "organizationId"=NEW."organizationId";
 SELECT xmin INTO header_xmin FROM public."InventoryReservation" WHERE id=NEW."reservationId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO line FROM public."OrderItem" WHERE id=NEW."orderItemId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO component FROM public."RecipeComponent" WHERE id=NEW."recipeComponentId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO recipe FROM public."RecipeVersion" WHERE id=component."recipeVersionId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO item FROM public."InventoryItem" WHERE id=NEW."inventoryItemId" AND "organizationId"=NEW."organizationId";
 SELECT "serviceType" INTO service_type FROM public."Order" WHERE id=reservation."orderId" AND "organizationId"=NEW."organizationId";
 IF header_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid OR reservation.status<>'PENDING'
  OR line."orderId" IS DISTINCT FROM reservation."orderId" OR recipe."productId" IS DISTINCT FROM line."productId"
  OR recipe.version IS DISTINCT FROM (SELECT max(version) FROM public."RecipeVersion" WHERE "productId"=line."productId" AND "organizationId"=NEW."organizationId")
  OR component."inventoryItemId" IS DISTINCT FROM NEW."inventoryItemId"
  OR NOT coalesce(service_type=ANY(component."serviceTypes"),false)
  OR NEW.quantity IS DISTINCT FROM line.quantity*component."quantityPerUnit"
  OR (NEW."itemName",NEW."itemSku",NEW.unit,NEW."productName") IS DISTINCT FROM (item.name,item.sku,item.unit,line."productName") THEN
  RAISE EXCEPTION 'reservation must snapshot the complete current recipe at send' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_line_write BEFORE INSERT ON "InventoryReservationLine"
 FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_reservation_line();
CREATE TRIGGER reservation_line_immutable BEFORE UPDATE OR DELETE ON "InventoryReservationLine"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.check_inventory_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_count bigint; actual_count bigint; header public."InventoryReservation";
BEGIN
 SELECT * INTO header FROM public."InventoryReservation" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
 IF TG_OP='INSERT' THEN
  SELECT count(*) INTO expected_count FROM public."OrderItem" oi
   JOIN public."Order" o ON o.id=oi."orderId" AND o."organizationId"=oi."organizationId"
   JOIN LATERAL (SELECT id FROM public."RecipeVersion" rv WHERE rv."organizationId"=oi."organizationId"
    AND rv."productId"=oi."productId" ORDER BY version DESC LIMIT 1) latest ON true
   JOIN public."RecipeComponent" rc ON rc."recipeVersionId"=latest.id AND rc."organizationId"=oi."organizationId"
   WHERE oi."orderId"=NEW."orderId" AND oi."organizationId"=NEW."organizationId" AND o."serviceType"=ANY(rc."serviceTypes");
  SELECT count(*) INTO actual_count FROM public."InventoryReservationLine" WHERE "reservationId"=NEW.id AND "organizationId"=NEW."organizationId";
  IF actual_count<>expected_count THEN
   RAISE EXCEPTION 'reservation must include every applicable recipe component' USING ERRCODE='23514';
  END IF;
 END IF;
 IF header.status='CONSUMED' AND NOT EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "orderId"=header."orderId" AND "organizationId"=header."organizationId" AND kind='CONSUMPTION') THEN
  RAISE EXCEPTION 'consumed reservation requires its ledger document' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_complete AFTER INSERT OR UPDATE ON "InventoryReservation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_inventory_reservation();
CREATE FUNCTION public.check_order_reservation_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public."InventoryReservation" r JOIN public."Order" o
  ON o.id=r."orderId" AND o."organizationId"=r."organizationId"
  WHERE o.id=NEW.id AND o."organizationId"=NEW."organizationId"
   AND ((o.status='COMPLETED' AND r.status<>'CONSUMED') OR (o.status='CANCELLED' AND r.status<>'RELEASED'))) THEN
  RAISE EXCEPTION 'finished order must resolve its inventory reservation atomically' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_reservation_resolution AFTER UPDATE ON "Order"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_reservation_resolution();
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
      OR ticket_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
      OR NOT EXISTS (SELECT 1 FROM public."InventoryReservation" WHERE "orderId"=NEW."orderId"
       AND "organizationId"=NEW."organizationId" AND status='PENDING') THEN
      RAISE EXCEPTION 'consumption requires pending reservation and atomic checkout' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_inventory_movement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc_row public."InventoryDocument"; doc_xmin xid; item_row public."InventoryItem";
  order_item public."OrderItem"; component public."RecipeComponent"; recipe public."RecipeVersion";
  service_type text; latest_version integer; current_quantity numeric;
BEGIN
  SELECT * INTO doc_row FROM public."InventoryDocument" WHERE id=NEW."documentId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  SELECT xmin INTO doc_xmin FROM public."InventoryDocument" WHERE id=NEW."documentId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  IF doc_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
    RAISE EXCEPTION 'inventory documents are sealed after their creation transaction' USING ERRCODE='23514';
  END IF;
  -- Every movement locks the same item, so COUNT sees a serialized preceding balance.
  SELECT * INTO item_row FROM public."InventoryItem" WHERE id=NEW."inventoryItemId"
    AND "organizationId"=NEW."organizationId" FOR UPDATE;
  IF doc_row.kind<>'CONSUMPTION' AND (NEW."itemName",NEW."itemSku",NEW.unit) IS DISTINCT FROM (item_row.name,item_row.sku,item_row.unit) THEN
    RAISE EXCEPTION 'inventory item snapshot does not match its source' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(quantity),0) INTO current_quantity FROM public."InventoryMovement"
    WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
      AND "inventoryItemId"=NEW."inventoryItemId";
  IF current_quantity+NEW.quantity NOT BETWEEN -999999999999.999999 AND 999999999999.999999 THEN
    RAISE EXCEPTION 'resulting inventory balance exceeds the supported exact quantity range' USING ERRCODE='23514';
  END IF;
  IF doc_row.kind='CONSUMPTION' THEN
    IF NEW."countedQuantity" IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public."InventoryReservationLine" l
      JOIN public."InventoryReservation" r ON r.id=l."reservationId" AND r."organizationId"=l."organizationId"
      WHERE r."orderId"=doc_row."orderId" AND r."organizationId"=NEW."organizationId"
      AND r.status='PENDING' AND l."locationId"=NEW."locationId"
      AND (l."inventoryItemId",l."orderItemId",l."recipeComponentId",-l.quantity,l."itemName",l."itemSku",l.unit,l."productName")
       IS NOT DISTINCT FROM (NEW."inventoryItemId",NEW."orderItemId",NEW."recipeComponentId",NEW.quantity,NEW."itemName",NEW."itemSku",NEW.unit,NEW."productName")
    ) THEN
      RAISE EXCEPTION 'consumption must exactly match the immutable send reservation' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW."orderItemId" IS NOT NULL OR NEW."recipeComponentId" IS NOT NULL OR NEW."productName" IS NOT NULL THEN
      RAISE EXCEPTION 'manual stock movement cannot claim an order recipe source' USING ERRCODE='23514';
    END IF;
    IF (doc_row.kind='RECEIPT' AND NEW.quantity<=0) OR (doc_row.kind='WASTE' AND NEW.quantity>=0)
      OR (doc_row.kind<>'COUNT' AND NEW."countedQuantity" IS NOT NULL) THEN
      RAISE EXCEPTION 'stock movement sign or counted quantity is invalid' USING ERRCODE='23514';
    END IF;
    IF doc_row.kind='COUNT' THEN
      IF NEW."countedQuantity" IS NULL OR NEW."countedQuantity" IS DISTINCT FROM current_quantity+NEW.quantity THEN
        RAISE EXCEPTION 'count delta must match the current serialized balance' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.check_inventory_document() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc public."InventoryDocument"; expected_count bigint; actual_count bigint; reservation public."InventoryReservation";
BEGIN
 SELECT * INTO doc FROM public."InventoryDocument" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
 SELECT count(*) INTO actual_count FROM public."InventoryMovement" WHERE "documentId"=doc.id AND "organizationId"=doc."organizationId";
 IF doc.kind='CONSUMPTION' THEN
  SELECT * INTO reservation FROM public."InventoryReservation" WHERE "orderId"=doc."orderId" AND "organizationId"=doc."organizationId";
  SELECT count(*) INTO expected_count FROM public."InventoryReservationLine" WHERE "reservationId"=reservation.id AND "organizationId"=doc."organizationId";
  IF reservation.status IS DISTINCT FROM 'CONSUMED' OR actual_count<>expected_count THEN
   RAISE EXCEPTION 'consumption requires every reserved line and resolved reservation' USING ERRCODE='23514';
  END IF;
 ELSIF actual_count=0 THEN
  RAISE EXCEPTION 'manual inventory document requires at least one movement' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
DO $reservation_security$
DECLARE table_name text; expression text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['InventoryReservation','InventoryReservationLine'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING (%s) WITH CHECK (%s)',table_name,expression,expression);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',table_name);
 END LOOP;
END $reservation_security$;
GRANT UPDATE ON "InventoryReservation" TO pos_runtime;
REVOKE ALL ON FUNCTION public.validate_inventory_reservation(),public.validate_inventory_reservation_line(),
 public.check_inventory_reservation(),public.check_order_reservation_resolution() FROM PUBLIC;
COMMIT;
