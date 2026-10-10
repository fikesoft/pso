-- Quantity inventory: immutable recipes and ledger, without cost accounting or backfill.
BEGIN;
CREATE TABLE "InventoryItem" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  sku text NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  kind text NOT NULL CHECK (kind IN ('INGREDIENT','PACKAGING','CONSUMABLE')),
  unit text NOT NULL CHECK (unit IN ('G','ML','PCS')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId",sku),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "RecipeVersion" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "productId" uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  "requestKey" uuid NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","productId",version),
  UNIQUE ("organizationId","requestKey"),
  FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "RecipeComponent" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "recipeVersionId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  position integer NOT NULL CHECK (position>=0),
  purpose text NOT NULL CHECK (purpose IN ('MAIN','AUXILIARY','PACKAGING','CONSUMABLE')),
  "quantityPerUnit" numeric(18,3) NOT NULL CHECK ("quantityPerUnit">0 AND "quantityPerUnit"<=999999.999),
  "serviceTypes" text[] NOT NULL,
  CONSTRAINT recipe_services CHECK (
    cardinality("serviceTypes") BETWEEN 1 AND 3
    AND array_position("serviceTypes",NULL) IS NULL
    AND "serviceTypes" <@ ARRAY['DINE_IN','TAKEAWAY','DELIVERY']::text[]
    AND cardinality("serviceTypes")=
      CASE WHEN 'DINE_IN'=ANY("serviceTypes") THEN 1 ELSE 0 END
      + CASE WHEN 'TAKEAWAY'=ANY("serviceTypes") THEN 1 ELSE 0 END
      + CASE WHEN 'DELIVERY'=ANY("serviceTypes") THEN 1 ELSE 0 END
  ),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","recipeVersionId","inventoryItemId"),
  UNIQUE ("organizationId","recipeVersionId",position),
  FOREIGN KEY ("organizationId","recipeVersionId") REFERENCES "RecipeVersion"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","inventoryItemId") REFERENCES "InventoryItem"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "InventoryDocument" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('RECEIPT','WASTE','COUNT','CONSUMPTION')),
  "requestKey" uuid NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  "orderId" uuid,
  "createdByUserId" uuid NOT NULL,
  "actorName" text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_document_order CHECK ((kind='CONSUMPTION')=("orderId" IS NOT NULL)),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","locationId","requestKey"),
  FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX inventory_consumption_order ON "InventoryDocument"("organizationId","orderId") WHERE kind='CONSUMPTION';
CREATE INDEX "InventoryDocument_organizationId_locationId_createdAt_idx"
  ON "InventoryDocument"("organizationId","locationId","createdAt");
CREATE TABLE "InventoryMovement" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "documentId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity>'-Infinity'::numeric AND quantity<'Infinity'::numeric),
  "countedQuantity" numeric(18,6) CHECK ("countedQuantity">=0 AND "countedQuantity"<'Infinity'::numeric),
  "itemName" text NOT NULL,
  "itemSku" text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('G','ML','PCS')),
  "orderItemId" uuid,
  "recipeComponentId" uuid,
  "productName" text,
  CONSTRAINT inventory_movement_source CHECK (
    ("orderItemId" IS NULL AND "recipeComponentId" IS NULL AND "productName" IS NULL)
    OR ("orderItemId" IS NOT NULL AND "recipeComponentId" IS NOT NULL AND "productName" IS NOT NULL)
  ),
  UNIQUE ("organizationId",id),
  FOREIGN KEY ("organizationId","locationId","documentId") REFERENCES "InventoryDocument"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","inventoryItemId") REFERENCES "InventoryItem"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","orderItemId") REFERENCES "OrderItem"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","recipeComponentId") REFERENCES "RecipeComponent"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX inventory_consumption_line ON "InventoryMovement"("organizationId","documentId","orderItemId","recipeComponentId") WHERE "orderItemId" IS NOT NULL;
CREATE UNIQUE INDEX inventory_manual_line ON "InventoryMovement"("organizationId","documentId","inventoryItemId") WHERE "orderItemId" IS NULL;
CREATE INDEX "InventoryMovement_organizationId_locationId_inventoryItemId_idx"
  ON "InventoryMovement"("organizationId","locationId","inventoryItemId");

CREATE FUNCTION public.protect_inventory_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.version<>OLD.version+1 OR
    (to_jsonb(NEW)-ARRAY['name','status','version','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['name','status','version','updatedAt']) THEN
    RAISE EXCEPTION 'inventory identity unit kind and SKU are immutable; increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_item_version BEFORE UPDATE ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION public.protect_inventory_item();

CREATE FUNCTION public.validate_recipe_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE next_version integer;
BEGIN
  PERFORM id FROM public."Product" WHERE id=NEW."productId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipe product is outside tenant context' USING ERRCODE='23514'; END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public."RecipeVersion"
    WHERE "organizationId"=NEW."organizationId" AND "productId"=NEW."productId";
  IF NEW.version<>next_version THEN RAISE EXCEPTION 'recipe version must follow the latest version' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recipe_version_creation BEFORE INSERT ON "RecipeVersion"
  FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_version();

CREATE FUNCTION public.validate_recipe_component() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE version_xmin xid; item_row public."InventoryItem";
BEGIN
  SELECT xmin INTO version_xmin FROM public."RecipeVersion"
    WHERE id=NEW."recipeVersionId" AND "organizationId"=NEW."organizationId";
  SELECT * INTO item_row FROM public."InventoryItem"
    WHERE id=NEW."inventoryItemId" AND "organizationId"=NEW."organizationId";
  IF version_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
    OR item_row.status IS DISTINCT FROM 'ACTIVE'
    OR NOT ((item_row.kind='INGREDIENT' AND NEW.purpose IN ('MAIN','AUXILIARY'))
      OR (item_row.kind='PACKAGING' AND NEW.purpose='PACKAGING')
      OR (item_row.kind='CONSUMABLE' AND NEW.purpose='CONSUMABLE')) THEN
    RAISE EXCEPTION 'recipe components must be compatible active items in the version creation transaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recipe_component_creation BEFORE INSERT ON "RecipeComponent"
  FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_component();

CREATE FUNCTION public.validate_inventory_document() RETURNS trigger
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
    SELECT xmin INTO ticket_xmin FROM public."KitchenTicket" WHERE "orderId"=NEW."orderId"
      AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
      AND status='NEW' AND revision=1 AND "orderVersion"=order_row.version;
    IF order_row.status IS DISTINCT FROM 'OPEN' OR order_row."kitchenStatus" IS DISTINCT FROM 'NEW'
      OR ticket_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
      RAISE EXCEPTION 'consumption is recorded atomically with the new kitchen send' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_document_creation BEFORE INSERT ON "InventoryDocument"
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_document();

CREATE FUNCTION public.validate_inventory_movement() RETURNS trigger
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
  IF (NEW."itemName",NEW."itemSku",NEW.unit) IS DISTINCT FROM (item_row.name,item_row.sku,item_row.unit) THEN
    RAISE EXCEPTION 'inventory item snapshot does not match its source' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(quantity),0) INTO current_quantity FROM public."InventoryMovement"
    WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
      AND "inventoryItemId"=NEW."inventoryItemId";
  IF current_quantity+NEW.quantity NOT BETWEEN -999999999999.999999 AND 999999999999.999999 THEN
    RAISE EXCEPTION 'resulting inventory balance exceeds the supported exact quantity range' USING ERRCODE='23514';
  END IF;
  IF doc_row.kind='CONSUMPTION' THEN
    SELECT * INTO order_item FROM public."OrderItem" WHERE id=NEW."orderItemId"
      AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
    SELECT * INTO component FROM public."RecipeComponent"
      WHERE id=NEW."recipeComponentId" AND "organizationId"=NEW."organizationId";
    SELECT * INTO recipe FROM public."RecipeVersion"
      WHERE id=component."recipeVersionId" AND "organizationId"=NEW."organizationId";
    SELECT max(version) INTO latest_version FROM public."RecipeVersion"
      WHERE "productId"=order_item."productId" AND "organizationId"=NEW."organizationId";
    SELECT "serviceType" INTO service_type FROM public."Order"
      WHERE id=doc_row."orderId" AND "organizationId"=NEW."organizationId";
    IF order_item."orderId" IS DISTINCT FROM doc_row."orderId"
      OR recipe."productId" IS DISTINCT FROM order_item."productId"
      OR recipe.version IS DISTINCT FROM latest_version
      OR component."inventoryItemId" IS DISTINCT FROM NEW."inventoryItemId"
      OR NOT coalesce(service_type=ANY(component."serviceTypes"),false)
      OR NEW.quantity IS DISTINCT FROM -(order_item.quantity*component."quantityPerUnit")
      OR NEW."productName" IS DISTINCT FROM order_item."productName" OR NEW."countedQuantity" IS NOT NULL THEN
      RAISE EXCEPTION 'consumption must exactly match the applicable current recipe and order snapshot' USING ERRCODE='23514';
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
CREATE TRIGGER inventory_movement_creation BEFORE INSERT ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_movement();

CREATE FUNCTION public.check_inventory_document() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc_id uuid; doc_row public."InventoryDocument"; expected_count bigint; actual_count bigint;
BEGIN
  IF TG_TABLE_NAME='InventoryDocument' THEN doc_id:=NEW.id; ELSE doc_id:=NEW."documentId"; END IF;
  SELECT * INTO doc_row FROM public."InventoryDocument" WHERE id=doc_id AND "organizationId"=NEW."organizationId";
  SELECT count(*) INTO actual_count FROM public."InventoryMovement"
    WHERE "documentId"=doc_id AND "organizationId"=doc_row."organizationId";
  IF doc_row.kind='CONSUMPTION' THEN
    SELECT count(*) INTO expected_count FROM public."OrderItem" oi
      JOIN public."Order" o ON o.id=oi."orderId" AND o."organizationId"=oi."organizationId"
      JOIN LATERAL (SELECT id FROM public."RecipeVersion" rv
        WHERE rv."organizationId"=oi."organizationId" AND rv."productId"=oi."productId"
        ORDER BY version DESC LIMIT 1) latest ON true
      JOIN public."RecipeComponent" rc ON rc."recipeVersionId"=latest.id AND rc."organizationId"=oi."organizationId"
      WHERE oi."orderId"=doc_row."orderId" AND oi."organizationId"=doc_row."organizationId"
        AND o."serviceType"=ANY(rc."serviceTypes");
    IF actual_count<>expected_count OR EXISTS (
      SELECT 1 FROM public."InventoryMovement" m
        JOIN public."RecipeComponent" rc ON rc.id=m."recipeComponentId" AND rc."organizationId"=m."organizationId"
        JOIN public."RecipeVersion" rv ON rv.id=rc."recipeVersionId" AND rv."organizationId"=rc."organizationId"
        WHERE m."documentId"=doc_id AND m."organizationId"=doc_row."organizationId"
          AND rv.version<>(SELECT max(version) FROM public."RecipeVersion" current_recipe
            WHERE current_recipe."organizationId"=rv."organizationId" AND current_recipe."productId"=rv."productId")
    ) THEN
      RAISE EXCEPTION 'consumption document must contain every applicable recipe component' USING ERRCODE='23514';
    END IF;
  ELSIF actual_count=0 THEN
    RAISE EXCEPTION 'manual inventory document requires at least one movement' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_document_complete AFTER INSERT ON "InventoryDocument"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_inventory_document();

DO $inventory_security$
DECLARE table_name text; expression text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
  FOREACH table_name IN ARRAY ARRAY['InventoryItem','RecipeVersion','RecipeComponent','InventoryDocument','InventoryMovement'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING (%s) WITH CHECK (%s)',table_name,expression,expression);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',table_name);
    IF table_name<>'InventoryItem' THEN
      EXECUTE format('CREATE TRIGGER inventory_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',table_name);
    END IF;
  END LOOP;
END $inventory_security$;
GRANT UPDATE ON "InventoryItem" TO pos_runtime;
REVOKE ALL ON FUNCTION public.protect_inventory_item(),public.validate_recipe_version(),public.validate_recipe_component(),
  public.validate_inventory_document(),public.validate_inventory_movement(),public.check_inventory_document() FROM PUBLIC;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
  ('inventory.read','Vizualizarea inventarului',ARRAY['LOCATION']::text[],true),
  ('inventory.manage','Administrarea stocurilor',ARRAY['ORGANIZATION','LOCATION']::text[],true),
  ('inventory.recipes.manage','Administrarea rețetelor',ARRAY['ORGANIZATION']::text[],true);
COMMIT;
