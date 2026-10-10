-- Stage C is additive: operational catalog, draft orders and sealed kitchen snapshots.
-- Monetary values are exact numeric; round each line half away from zero, then sum cents.
CREATE TABLE "Category" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId",name),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT
);
CREATE TABLE "Product" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "categoryId" uuid,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  sku text NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 64),
  description text CHECK (length(description) <= 2000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId",sku),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","categoryId") REFERENCES "Category"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "LocationProduct" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "productId" uuid NOT NULL,
  price numeric(18,4) NOT NULL CHECK (price >= 0 AND price < 'Infinity'::numeric),
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId","productId"),
  FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "Order" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','CANCELLED','COMPLETED')),
  "serviceType" text NOT NULL CHECK ("serviceType" IN ('DINE_IN','TAKEAWAY','DELIVERY')),
  "tableLabel" text CHECK (length("tableLabel") <= 80),
  notes text CHECK (length(notes) <= 1000),
  currency text NOT NULL DEFAULT 'MDL' CHECK (currency = 'MDL'),
  total numeric(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0 AND total < 'Infinity'::numeric),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "kitchenStatus" text NOT NULL DEFAULT 'NOT_SENT' CHECK ("kitchenStatus" IN ('NOT_SENT','NEW','PREPARING','READY')),
  "clientRequestId" uuid NOT NULL,
  "creationRequestHash" text NOT NULL CHECK ("creationRequestHash" ~ '^[a-f0-9]{64}$'),
  "createdByUserId" uuid NOT NULL,
  "updatedByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","locationId",number),
  UNIQUE ("organizationId","locationId","clientRequestId"),
  FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "Order_organizationId_locationId_status_createdAt_idx"
  ON "Order"("organizationId","locationId",status,"createdAt");
CREATE TABLE "OrderItem" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "orderId" uuid NOT NULL,
  "productId" uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  "productName" text NOT NULL CHECK (length(btrim("productName")) BETWEEN 1 AND 160),
  "productSku" text NOT NULL CHECK (length(btrim("productSku")) BETWEEN 1 AND 64),
  "unitPrice" numeric(18,4) NOT NULL CHECK ("unitPrice" >= 0 AND "unitPrice" < 'Infinity'::numeric),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  "lineTotal" numeric(18,2) NOT NULL CHECK ("lineTotal" >= 0 AND "lineTotal" = round("unitPrice" * quantity,2)),
  note text CHECK (length(note) <= 500),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","orderId",position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "KitchenTicket" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "orderId" uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "orderVersion" integer NOT NULL CHECK ("orderVersion" > 0),
  "requestKey" uuid NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PREPARING','READY','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "sentByUserId" uuid NOT NULL,
  "updatedByUserId" uuid,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","orderId",revision),
  UNIQUE ("organizationId","locationId","requestKey"),
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","sentByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "KitchenTicket_organizationId_locationId_status_createdAt_idx"
  ON "KitchenTicket"("organizationId","locationId",status,"createdAt");
CREATE TABLE "KitchenTicketItem" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "ticketId" uuid NOT NULL,
  "orderItemId" uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  "productName" text NOT NULL,
  "productSku" text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  note text CHECK (length(note) <= 500),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","ticketId",position),
  UNIQUE ("organizationId","ticketId","orderItemId"),
  FOREIGN KEY ("organizationId","locationId","ticketId") REFERENCES "KitchenTicket"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","orderItemId") REFERENCES "OrderItem"("organizationId","locationId",id) ON DELETE RESTRICT
);
CREATE TABLE "OrderStatusEvent" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "orderId" uuid NOT NULL,
  kind text NOT NULL CHECK (length(btrim(kind)) BETWEEN 1 AND 80),
  "fromStatus" text,
  "toStatus" text NOT NULL CHECK (length(btrim("toStatus")) BETWEEN 1 AND 80),
  "actorUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "OrderStatusEvent_organizationId_locationId_orderId_createdAt_idx"
  ON "OrderStatusEvent"("organizationId","locationId","orderId","createdAt");

-- Updates require explicit optimistic concurrency; tenant/location identity cannot move.
CREATE FUNCTION public.protect_catalog_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.version <> OLD.version + 1
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (TG_TABLE_NAME='Product' AND to_jsonb(NEW)->'createdByUserId' IS DISTINCT FROM to_jsonb(OLD)->'createdByUserId')
    OR (TG_TABLE_NAME='LocationProduct' AND
      (to_jsonb(NEW)->'locationId' IS DISTINCT FROM to_jsonb(OLD)->'locationId'
       OR to_jsonb(NEW)->'productId' IS DISTINCT FROM to_jsonb(OLD)->'productId')) THEN
    RAISE EXCEPTION 'catalog identity is immutable and version must increment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER category_version BEFORE UPDATE ON "Category" FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_version();
CREATE TRIGGER product_version BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_version();
CREATE TRIGGER location_product_version BEFORE UPDATE ON "LocationProduct" FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_version();

CREATE FUNCTION public.protect_order_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'DRAFT' OR NEW."kitchenStatus" <> 'NOT_SENT' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'orders begin as unsent drafts' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.version <> OLD.version + 1
    OR (to_jsonb(NEW)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
    OR (OLD.status <> 'DRAFT' AND
       (to_jsonb(NEW)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt']))
    OR OLD.status IN ('CANCELLED','COMPLETED')
    OR (OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','OPEN','CANCELLED'))
    OR (OLD.status='OPEN' AND NEW.status NOT IN ('OPEN','CANCELLED','COMPLETED'))
    OR (NEW.status='COMPLETED' AND NEW."kitchenStatus" <> 'READY') THEN
    RAISE EXCEPTION 'invalid order transition or immutable snapshot mutation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_history BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION public.protect_order_history();
CREATE TRIGGER order_no_delete BEFORE DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.protect_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item_row jsonb; parent_status text;
BEGIN
  item_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  SELECT status INTO parent_status FROM public."Order"
    WHERE id=(item_row->>'orderId')::uuid AND "organizationId"=(item_row->>'organizationId')::uuid
      AND "locationId"=(item_row->>'locationId')::uuid FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'only draft order items can change' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND
    (NEW.id IS DISTINCT FROM OLD.id OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."locationId" IS DISTINCT FROM OLD."locationId" OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt") THEN
    RAISE EXCEPTION 'order item identity is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER draft_order_item BEFORE INSERT OR UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION public.protect_order_item();

CREATE FUNCTION public.protect_kitchen_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order";
BEGIN
  SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
  IF TG_OP='INSERT' THEN
    IF order_row.status IS DISTINCT FROM 'DRAFT' OR NEW.status <> 'NEW'
      OR NEW.version <> 1 OR NEW.revision <> 1 OR NEW."orderVersion" <> order_row.version+1 THEN
      RAISE EXCEPTION 'initial kitchen snapshot requires a draft and its next version' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.version <> OLD.version+1 OR NEW."updatedByUserId" IS NULL
    OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt'])
    OR NOT ((OLD.status='NEW' AND NEW.status IN ('PREPARING','CANCELLED'))
      OR (OLD.status='PREPARING' AND NEW.status IN ('READY','CANCELLED')))
    OR order_row.status <> 'OPEN' THEN
    RAISE EXCEPTION 'invalid kitchen transition or immutable ticket mutation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kitchen_ticket_history BEFORE INSERT OR UPDATE ON "KitchenTicket" FOR EACH ROW EXECUTE FUNCTION public.protect_kitchen_ticket();
CREATE TRIGGER kitchen_ticket_no_delete BEFORE DELETE ON "KitchenTicket" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER kitchen_item_immutable BEFORE UPDATE OR DELETE ON "KitchenTicketItem" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER order_event_immutable BEFORE UPDATE OR DELETE ON "OrderStatusEvent" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.seal_kitchen_ticket_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket_xmin xid; ticket_order_id uuid; item_row public."OrderItem";
BEGIN
  SELECT xmin,"orderId" INTO ticket_xmin,ticket_order_id FROM public."KitchenTicket"
    WHERE id=NEW."ticketId" AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  SELECT * INTO item_row FROM public."OrderItem" WHERE id=NEW."orderItemId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  IF ticket_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
    OR item_row."orderId" IS DISTINCT FROM ticket_order_id
    OR (NEW.position,NEW."productName",NEW."productSku",NEW.quantity,NEW.note)
       IS DISTINCT FROM (item_row.position,item_row."productName",item_row."productSku",item_row.quantity,item_row.note) THEN
    RAISE EXCEPTION 'kitchen content must be the exact order snapshot at ticket creation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kitchen_item_seal BEFORE INSERT ON "KitchenTicketItem" FOR EACH ROW EXECUTE FUNCTION public.seal_kitchen_ticket_item();

-- Deferred checks permit atomic replacement of a draft and atomic ticket+OPEN publication.
CREATE FUNCTION public.check_order_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed jsonb; order_id uuid; org_id uuid; order_row public."Order";
  ticket_row public."KitchenTicket"; item_total numeric; item_count bigint; ticket_count bigint;
BEGIN
  changed := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  org_id := (changed->>'organizationId')::uuid;
  IF TG_TABLE_NAME='Order' THEN order_id := (changed->>'id')::uuid;
  ELSIF TG_TABLE_NAME='KitchenTicketItem' THEN
    SELECT "orderId" INTO order_id FROM public."KitchenTicket"
      WHERE id=(changed->>'ticketId')::uuid AND "organizationId"=org_id;
  ELSE order_id := (changed->>'orderId')::uuid;
  END IF;
  SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
  SELECT coalesce(sum("lineTotal"),0),count(*) INTO item_total,item_count
    FROM public."OrderItem" WHERE "organizationId"=org_id AND "orderId"=order_id;
  IF order_row.total IS DISTINCT FROM item_total THEN
    RAISE EXCEPTION 'order total must equal rounded line totals' USING ERRCODE='23514';
  END IF;
  SELECT * INTO ticket_row FROM public."KitchenTicket" WHERE "organizationId"=org_id AND "orderId"=order_id;
  IF ticket_row.id IS NULL THEN
    IF order_row.status NOT IN ('DRAFT','CANCELLED') OR order_row."kitchenStatus" <> 'NOT_SENT' THEN
      RAISE EXCEPTION 'operational order requires a kitchen snapshot' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT count(*) INTO ticket_count FROM public."KitchenTicketItem"
      WHERE "organizationId"=org_id AND "ticketId"=ticket_row.id;
    IF order_row.status='DRAFT' OR item_count=0 OR ticket_count<>item_count
      OR ticket_row."orderVersion">order_row.version
      OR (order_row.status<>'CANCELLED' AND order_row."kitchenStatus"<>ticket_row.status)
      OR (ticket_row.status='CANCELLED' AND order_row.status<>'CANCELLED')
      OR EXISTS (
        SELECT 1 FROM public."KitchenTicketItem" ki
          JOIN public."OrderItem" oi ON oi.id=ki."orderItemId" AND oi."organizationId"=ki."organizationId"
          WHERE ki."organizationId"=org_id AND ki."ticketId"=ticket_row.id
          AND (ki.position,ki."productName",ki."productSku",ki.quantity,ki.note)
            IS DISTINCT FROM (oi.position,oi."productName",oi."productSku",oi.quantity,oi.note)
      ) THEN
      RAISE EXCEPTION 'kitchen snapshot must be complete and consistent with its order' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_consistency AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_consistency();
CREATE CONSTRAINT TRIGGER order_item_consistency AFTER INSERT OR UPDATE OR DELETE ON "OrderItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_consistency();
CREATE CONSTRAINT TRIGGER ticket_consistency AFTER INSERT OR UPDATE ON "KitchenTicket" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_consistency();
CREATE CONSTRAINT TRIGGER ticket_item_consistency AFTER INSERT ON "KitchenTicketItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_consistency();

DO $rls$
DECLARE table_name text; expression text := '"organizationId" = nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Category','Product','LocationProduct','Order','OrderItem','KitchenTicket','KitchenTicketItem','OrderStatusEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING (%s) WITH CHECK (%s)',table_name,expression,expression);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
  END LOOP;
END $rls$;
GRANT SELECT,INSERT,UPDATE ON "Category","Product","LocationProduct","Order","KitchenTicket" TO pos_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON "OrderItem" TO pos_runtime;
GRANT SELECT,INSERT ON "KitchenTicketItem","OrderStatusEvent" TO pos_runtime;
REVOKE ALL ON FUNCTION public.protect_catalog_version(),public.protect_order_history(),public.protect_order_item(),
  public.protect_kitchen_ticket(),public.seal_kitchen_ticket_item(),public.check_order_consistency() FROM PUBLIC;

-- Common products/categories require organization scope; local prices retain location scope.
UPDATE "Permission" SET "scopeTypes"=ARRAY['ORGANIZATION','LOCATION']::text[] WHERE key='catalog.manage';
