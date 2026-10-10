BEGIN;
LOCK TABLE public."OrderItem",public."WebsiteOrderItem",public."KitchenTicketItem",public."InventoryReservationLine",public."InventoryMovement" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public."OrderItem" ADD COLUMN "baseUnitPrice" numeric(18,4), ADD COLUMN "sourceWebsiteOrderItemId" uuid;
ALTER TABLE public."OrderItem" ADD COLUMN "modifierCreatedTransaction" bigint NOT NULL DEFAULT txid_current();
ALTER TABLE public."WebsiteOrderItem" ADD COLUMN "baseUnitPrice" numeric(18,4), ADD UNIQUE ("organizationId","locationId",id);
ALTER TABLE public."WebsiteOrderItem" ADD COLUMN "modifierCreatedTransaction" bigint NOT NULL DEFAULT txid_current();
-- Factual backfill of newly added base prices only; no historical amount changes.
DO $base_backfill$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['OrderItem','WebsiteOrderItem'] LOOP
  EXECUTE format('CREATE POLICY modifier_upgrade ON public.%I TO pos_migrator USING (true) WITH CHECK (true)',tab);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',tab);
  EXECUTE format('UPDATE public.%I SET "baseUnitPrice"="unitPrice"',tab);
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',tab);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "baseUnitPrice" SET NOT NULL',tab);
  EXECUTE format('ALTER TABLE public.%I ADD CHECK ("baseUnitPrice">=0 AND "baseUnitPrice"<''Infinity''::numeric)',tab);
  EXECUTE format('DROP POLICY modifier_upgrade ON public.%I',tab);
 END LOOP;
END $base_backfill$;
ALTER TABLE public."OrderItem" ADD CONSTRAINT order_item_website_source_fk FOREIGN KEY ("organizationId","locationId","sourceWebsiteOrderItemId")
 REFERENCES public."WebsiteOrderItem"("organizationId","locationId",id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX order_item_website_source_unique ON public."OrderItem"("organizationId","sourceWebsiteOrderItemId") WHERE "sourceWebsiteOrderItemId" IS NOT NULL;
ALTER TABLE public."KitchenTicketItem" ADD COLUMN "modifierSnapshot" jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("modifierSnapshot")='array');

CREATE TABLE public."OrderItemModifierGroup" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"locationId" uuid NOT NULL,"orderItemId" uuid NOT NULL,
 "productModifierGroupId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,"groupName" text NOT NULL,
 "minSelections" integer NOT NULL,"maxSelections" integer NOT NULL,
 "groupVersion" integer NOT NULL CHECK ("groupVersion">0),"bindingVersion" integer NOT NULL CHECK ("bindingVersion">0),
 position integer NOT NULL CHECK (position BETWEEN 0 AND 9),
 CHECK ("minSelections">=0 AND "minSelections"<="maxSelections" AND "maxSelections" BETWEEN 1 AND 10),
 UNIQUE ("organizationId",id),
 CONSTRAINT order_modifier_group_parent_key UNIQUE ("organizationId","locationId","orderItemId",id,"modifierGroupId"),
 CONSTRAINT order_modifier_group_source_key UNIQUE ("organizationId","orderItemId","modifierGroupId"),
 CONSTRAINT order_modifier_group_position_key UNIQUE ("organizationId","orderItemId",position),
 FOREIGN KEY ("organizationId","locationId","orderItemId") REFERENCES public."OrderItem"("organizationId","locationId",id) ON DELETE CASCADE,
 FOREIGN KEY ("organizationId","productModifierGroupId","modifierGroupId") REFERENCES public."ProductModifierGroup"("organizationId",id,"modifierGroupId") ON DELETE RESTRICT
);
CREATE TABLE public."OrderItemModifier" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"locationId" uuid NOT NULL,"orderItemId" uuid NOT NULL,
 "modifierGroupSnapshotId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,"modifierOptionId" uuid NOT NULL,
 "optionName" text NOT NULL,"extraPrice" numeric(18,4) NOT NULL CHECK ("extraPrice">=0 AND "extraPrice"<=999999.9999),
 "optionVersion" integer NOT NULL CHECK ("optionVersion">0),position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
 UNIQUE ("organizationId",id),
 CONSTRAINT order_modifier_option_source_key UNIQUE ("organizationId","orderItemId","modifierOptionId"),
 CONSTRAINT order_modifier_option_position_key UNIQUE ("organizationId","modifierGroupSnapshotId",position),
 FOREIGN KEY ("organizationId","locationId","orderItemId","modifierGroupSnapshotId","modifierGroupId")
  REFERENCES public."OrderItemModifierGroup"("organizationId","locationId","orderItemId",id,"modifierGroupId") ON DELETE CASCADE,
 FOREIGN KEY ("organizationId","modifierGroupId","modifierOptionId") REFERENCES public."ModifierOption"("organizationId","modifierGroupId",id) ON DELETE RESTRICT
);

CREATE TABLE public."WebsiteOrderItemModifierGroup" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"locationId" uuid NOT NULL,"websiteOrderItemId" uuid NOT NULL,
 "productModifierGroupId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,"groupName" text NOT NULL,
 "minSelections" integer NOT NULL,"maxSelections" integer NOT NULL,
 "groupVersion" integer NOT NULL CHECK ("groupVersion">0),"bindingVersion" integer NOT NULL CHECK ("bindingVersion">0),
 position integer NOT NULL CHECK (position BETWEEN 0 AND 9),
 CHECK ("minSelections">=0 AND "minSelections"<="maxSelections" AND "maxSelections" BETWEEN 1 AND 10),
 UNIQUE ("organizationId",id),
 CONSTRAINT website_modifier_group_parent_key UNIQUE ("organizationId","locationId","websiteOrderItemId",id,"modifierGroupId"),
 CONSTRAINT website_modifier_group_source_key UNIQUE ("organizationId","websiteOrderItemId","modifierGroupId"),
 CONSTRAINT website_modifier_group_position_key UNIQUE ("organizationId","websiteOrderItemId",position),
 FOREIGN KEY ("organizationId","locationId","websiteOrderItemId") REFERENCES public."WebsiteOrderItem"("organizationId","locationId",id) ON DELETE CASCADE,
 FOREIGN KEY ("organizationId","productModifierGroupId","modifierGroupId") REFERENCES public."ProductModifierGroup"("organizationId",id,"modifierGroupId") ON DELETE RESTRICT
);
CREATE TABLE public."WebsiteOrderItemModifier" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"locationId" uuid NOT NULL,"websiteOrderItemId" uuid NOT NULL,
 "modifierGroupSnapshotId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,"modifierOptionId" uuid NOT NULL,
 "optionName" text NOT NULL,"extraPrice" numeric(18,4) NOT NULL CHECK ("extraPrice">=0 AND "extraPrice"<=999999.9999),
 "optionVersion" integer NOT NULL CHECK ("optionVersion">0),position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
 UNIQUE ("organizationId",id),
 CONSTRAINT website_modifier_option_source_key UNIQUE ("organizationId","websiteOrderItemId","modifierOptionId"),
 CONSTRAINT website_modifier_option_position_key UNIQUE ("organizationId","modifierGroupSnapshotId",position),
 FOREIGN KEY ("organizationId","locationId","websiteOrderItemId","modifierGroupSnapshotId","modifierGroupId")
  REFERENCES public."WebsiteOrderItemModifierGroup"("organizationId","locationId","websiteOrderItemId",id,"modifierGroupId") ON DELETE CASCADE,
 FOREIGN KEY ("organizationId","modifierGroupId","modifierOptionId") REFERENCES public."ModifierOption"("organizationId","modifierGroupId",id) ON DELETE RESTRICT
);

ALTER TABLE public."OrderItemModifier" ADD UNIQUE ("organizationId","locationId","orderItemId",id);
DO $snapshot_security$
DECLARE tab text; tenant text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
 FOREACH tab IN ARRAY ARRAY['OrderItemModifierGroup','OrderItemModifier','WebsiteOrderItemModifierGroup','WebsiteOrderItemModifier'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',tab);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO pos_runtime',tab);
  EXECUTE format('CREATE POLICY modifier_snapshot_tenant ON public.%I TO pos_runtime USING (%s) WITH CHECK (%s)',tab,tenant,tenant);
 END LOOP;
END $snapshot_security$;

CREATE FUNCTION public.prepare_modifier_order_line() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source_id uuid;
BEGIN
 NEW."baseUnitPrice" := coalesce(NEW."baseUnitPrice",NEW."unitPrice");
 IF TG_TABLE_NAME='OrderItem' THEN
  IF TG_OP='UPDATE' THEN
   IF (NEW."baseUnitPrice",NEW."sourceWebsiteOrderItemId",NEW."modifierCreatedTransaction") IS DISTINCT FROM (OLD."baseUnitPrice",OLD."sourceWebsiteOrderItemId",OLD."modifierCreatedTransaction") THEN
    RAISE EXCEPTION 'retained line keeps its base price and website source' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
  END IF;
  source_id := NEW."sourceWebsiteOrderItemId";
 END IF;
 NEW."modifierCreatedTransaction" := txid_current();
 IF source_id IS NULL THEN
  -- Product, then group UUID order: the same order is used by binding writers.
  PERFORM id FROM public."Product" WHERE "organizationId"=NEW."organizationId" AND id=NEW."productId" FOR UPDATE;
  PERFORM g.id FROM public."ModifierGroup" g JOIN public."ProductModifierGroup" b
   ON b."organizationId"=g."organizationId" AND b."modifierGroupId"=g.id
   WHERE b."organizationId"=NEW."organizationId" AND b."productId"=NEW."productId" AND b.status='ACTIVE'
   ORDER BY g.id FOR UPDATE OF g;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER modifier_line_prepare BEFORE INSERT OR UPDATE ON public."OrderItem" FOR EACH ROW EXECUTE FUNCTION public.prepare_modifier_order_line();
CREATE TRIGGER modifier_line_prepare BEFORE INSERT ON public."WebsiteOrderItem" FOR EACH ROW EXECUTE FUNCTION public.prepare_modifier_order_line();

CREATE FUNCTION public.protect_modifier_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE website boolean := TG_TABLE_NAME LIKE 'Website%'; is_group boolean := TG_TABLE_NAME LIKE '%Group';
 parent_table text; parent_column text; parent_id uuid; parent jsonb; parent_xmin xid;
 source_id uuid; group_row public."ModifierGroup"; binding public."ProductModifierGroup";
 option_row public."ModifierOption"; source_group public."WebsiteOrderItemModifierGroup"; source_option public."WebsiteOrderItemModifier";
BEGIN
 parent_table := CASE WHEN website THEN 'WebsiteOrderItem' ELSE 'OrderItem' END;
 parent_column := CASE WHEN website THEN 'websiteOrderItemId' ELSE 'orderItemId' END;
 IF TG_OP='DELETE' THEN
  parent_id := (to_jsonb(OLD)->>parent_column)::uuid;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE "organizationId"=$1 AND id=$2',parent_table)
   INTO parent USING OLD."organizationId",parent_id;
  -- Only the FK cascade of a deleted draft line may erase its unsubmitted snapshot.
  IF NOT website AND pg_trigger_depth()>1 AND parent IS NULL THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'modifier snapshots are immutable except draft line cascade' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'modifier snapshots are immutable' USING ERRCODE='23514'; END IF;
 parent_id := (to_jsonb(NEW)->>parent_column)::uuid;
 EXECUTE format('SELECT to_jsonb(p),xmin FROM public.%I p WHERE "organizationId"=$1 AND "locationId"=$2 AND id=$3',parent_table)
  INTO parent,parent_xmin USING NEW."organizationId",NEW."locationId",parent_id;
 IF (parent->>'modifierCreatedTransaction')::bigint IS DISTINCT FROM txid_current() THEN
  RAISE EXCEPTION 'modifier snapshot belongs to the line creation transaction' USING ERRCODE='23514';
 END IF;
 source_id := (parent->>'sourceWebsiteOrderItemId')::uuid;
 IF is_group THEN
  IF source_id IS NOT NULL THEN
   SELECT * INTO source_group FROM public."WebsiteOrderItemModifierGroup" WHERE "organizationId"=NEW."organizationId"
    AND "websiteOrderItemId"=source_id AND "modifierGroupId"=NEW."modifierGroupId";
   IF source_group.id IS NULL OR (NEW."productModifierGroupId",NEW."groupName",NEW."minSelections",NEW."maxSelections",NEW."groupVersion",NEW."bindingVersion",NEW.position)
    IS DISTINCT FROM (source_group."productModifierGroupId",source_group."groupName",source_group."minSelections",source_group."maxSelections",source_group."groupVersion",source_group."bindingVersion",source_group.position) THEN
    RAISE EXCEPTION 'accepted modifier group must copy the website snapshot' USING ERRCODE='23514';
   END IF;
  ELSE
   SELECT * INTO binding FROM public."ProductModifierGroup" WHERE "organizationId"=NEW."organizationId" AND id=NEW."productModifierGroupId";
   SELECT * INTO group_row FROM public."ModifierGroup" WHERE "organizationId"=NEW."organizationId" AND id=NEW."modifierGroupId";
   IF binding."productId" IS DISTINCT FROM (parent->>'productId')::uuid OR binding."modifierGroupId" IS DISTINCT FROM NEW."modifierGroupId"
    OR binding.status IS DISTINCT FROM 'ACTIVE' OR group_row.status IS DISTINCT FROM 'ACTIVE'
    OR (NEW."groupName",NEW."minSelections",NEW."maxSelections",NEW."groupVersion",NEW."bindingVersion")
     IS DISTINCT FROM (group_row.name,group_row."minSelections",group_row."maxSelections",group_row.version,binding.version) THEN
    RAISE EXCEPTION 'modifier group snapshot must match the active product configuration' USING ERRCODE='23514';
   END IF;
  END IF;
 ELSE
  IF source_id IS NOT NULL THEN
   SELECT * INTO source_option FROM public."WebsiteOrderItemModifier" WHERE "organizationId"=NEW."organizationId"
    AND "websiteOrderItemId"=source_id AND "modifierOptionId"=NEW."modifierOptionId";
   IF source_option.id IS NULL OR (NEW."modifierGroupId",NEW."optionName",NEW."extraPrice",NEW."optionVersion",NEW.position)
    IS DISTINCT FROM (source_option."modifierGroupId",source_option."optionName",source_option."extraPrice",source_option."optionVersion",source_option.position) THEN
    RAISE EXCEPTION 'accepted modifier option must copy the website snapshot' USING ERRCODE='23514';
   END IF;
  ELSE
   SELECT * INTO option_row FROM public."ModifierOption" WHERE "organizationId"=NEW."organizationId" AND id=NEW."modifierOptionId";
   IF option_row.status IS DISTINCT FROM 'ACTIVE' OR (NEW."modifierGroupId",NEW."optionName",NEW."extraPrice",NEW."optionVersion")
    IS DISTINCT FROM (option_row."modifierGroupId",option_row.name,option_row."extraPrice",option_row.version) THEN
    RAISE EXCEPTION 'modifier option snapshot must match its active catalog option' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $snapshot_triggers$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['OrderItemModifierGroup','OrderItemModifier','WebsiteOrderItemModifierGroup','WebsiteOrderItemModifier'] LOOP
  EXECUTE format('CREATE TRIGGER modifier_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_modifier_snapshot()',tab);
 END LOOP;
END $snapshot_triggers$;

CREATE FUNCTION public.modifier_line_snapshot(org uuid,loc uuid,line uuid,website boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; group_table text; option_table text; parent_column text;
BEGIN
 group_table := CASE WHEN website THEN 'WebsiteOrderItemModifierGroup' ELSE 'OrderItemModifierGroup' END;
 option_table := CASE WHEN website THEN 'WebsiteOrderItemModifier' ELSE 'OrderItemModifier' END;
 parent_column := CASE WHEN website THEN 'websiteOrderItemId' ELSE 'orderItemId' END;
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''bindingId'',g."productModifierGroupId",''groupId'',g."modifierGroupId",''groupName'',g."groupName",''minSelections'',g."minSelections",''maxSelections'',g."maxSelections",''groupVersion'',g."groupVersion",''bindingVersion'',g."bindingVersion",''position'',g.position,''options'',coalesce((SELECT jsonb_agg(jsonb_build_object(''optionId'',o."modifierOptionId",''optionName'',o."optionName",''extraPrice'',o."extraPrice"::text,''optionVersion'',o."optionVersion",''position'',o.position) ORDER BY o.position) FROM public.%I o WHERE o."organizationId"=g."organizationId" AND o."modifierGroupSnapshotId"=g.id),''[]''::jsonb)) ORDER BY g.position),''[]''::jsonb) FROM public.%I g WHERE g."organizationId"=$1 AND g."locationId"=$2 AND g.%I=$3',option_table,group_table,parent_column)
 INTO result USING org,loc,line;
 RETURN result;
END $$;

CREATE FUNCTION public.check_modifier_line_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE website boolean := TG_TABLE_NAME='WebsiteOrderItem'; group_table text; option_table text; parent_column text;
 parent jsonb; source public."WebsiteOrderItem"; header public."WebsiteOrder"; expected_count integer; actual_count integer;
 selections integer; extras numeric; invalid boolean;
BEGIN
 EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE "organizationId"=$1 AND id=$2',TG_TABLE_NAME) INTO parent USING NEW."organizationId",NEW.id;
 IF parent IS NULL THEN RETURN NULL; END IF;
 group_table := CASE WHEN website THEN 'WebsiteOrderItemModifierGroup' ELSE 'OrderItemModifierGroup' END;
 option_table := CASE WHEN website THEN 'WebsiteOrderItemModifier' ELSE 'OrderItemModifier' END;
 parent_column := CASE WHEN website THEN 'websiteOrderItemId' ELSE 'orderItemId' END;
 IF parent->>'sourceWebsiteOrderItemId' IS NOT NULL THEN
  SELECT * INTO source FROM public."WebsiteOrderItem" WHERE "organizationId"=NEW."organizationId" AND id=(parent->>'sourceWebsiteOrderItemId')::uuid;
  SELECT * INTO header FROM public."WebsiteOrder" WHERE "organizationId"=NEW."organizationId" AND id=source."websiteOrderId";
  IF header.status IS DISTINCT FROM 'ACCEPTED' OR header."orderId" IS DISTINCT FROM (parent->>'orderId')::uuid
   OR (source."productId",source."baseUnitPrice",source."unitPrice",source.quantity,source."lineTotal")
    IS DISTINCT FROM (NEW."productId",NEW."baseUnitPrice",NEW."unitPrice",NEW.quantity,NEW."lineTotal")
   OR public.modifier_line_snapshot(NEW."organizationId",NEW."locationId",NEW.id,false)
    IS DISTINCT FROM public.modifier_line_snapshot(NEW."organizationId",NEW."locationId",source.id,true) THEN
   RAISE EXCEPTION 'accepted line must preserve its exact website modifier snapshot' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO expected_count FROM public."WebsiteOrderItemModifierGroup" WHERE "organizationId"=NEW."organizationId" AND "websiteOrderItemId"=source.id;
 ELSE
  SELECT count(*) INTO expected_count FROM public."ProductModifierGroup" WHERE "organizationId"=NEW."organizationId" AND "productId"=NEW."productId" AND status='ACTIVE';
 END IF;
 EXECUTE format('SELECT count(*) FROM public.%I WHERE "organizationId"=$1 AND %I=$2',group_table,parent_column) INTO actual_count USING NEW."organizationId",NEW.id;
 EXECUTE format('SELECT count(*),coalesce(sum("extraPrice"),0) FROM public.%I WHERE "organizationId"=$1 AND %I=$2',option_table,parent_column) INTO selections,extras USING NEW."organizationId",NEW.id;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I g WHERE g."organizationId"=$1 AND g.%I=$2 AND (SELECT count(*) FROM public.%I o WHERE o."organizationId"=g."organizationId" AND o."modifierGroupSnapshotId"=g.id) NOT BETWEEN g."minSelections" AND g."maxSelections")',group_table,parent_column,option_table) INTO invalid USING NEW."organizationId",NEW.id;
 IF actual_count<>expected_count OR selections>20 OR invalid OR NEW."unitPrice"<>NEW."baseUnitPrice"+extras THEN
  RAISE EXCEPTION 'modifier line requires every group, valid selections and exact base plus extras' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_modifier_complete AFTER INSERT ON public."OrderItem"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_modifier_line_complete();
CREATE CONSTRAINT TRIGGER website_modifier_complete AFTER INSERT ON public."WebsiteOrderItem"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_modifier_line_complete();

CREATE FUNCTION public.seal_kitchen_modifiers() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW."modifierSnapshot" := public.modifier_line_snapshot(NEW."organizationId",NEW."locationId",NEW."orderItemId",false);
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_modifier_seal BEFORE INSERT ON public."KitchenTicketItem" FOR EACH ROW EXECUTE FUNCTION public.seal_kitchen_modifiers();
CREATE FUNCTION public.check_kitchen_modifiers() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."modifierSnapshot" IS DISTINCT FROM public.modifier_line_snapshot(NEW."organizationId",NEW."locationId",NEW."orderItemId",false) THEN
  RAISE EXCEPTION 'kitchen modifiers must match the complete order snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER kitchen_modifier_complete AFTER INSERT ON public."KitchenTicketItem"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_modifiers();

CREATE OR REPLACE FUNCTION public.protect_modifier_catalog() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE mutable text[];
BEGIN
 mutable := CASE TG_TABLE_NAME WHEN 'ModifierGroup' THEN ARRAY['name','minSelections','maxSelections','sortOrder','status','version','updatedAt']
  WHEN 'ModifierOption' THEN ARRAY['name','extraPrice','sortOrder','status','version','updatedAt']
  ELSE ARRAY['sortOrder','status','version','updatedAt'] END;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable)) THEN
  RAISE EXCEPTION 'modifier identity is immutable and version must increment' USING ERRCODE='23514';
 END IF;
 -- Updating the common parent defeats snapshot-isolation write skew between
 -- separate option/binding rows. API writers already take the tenant lock first.
 IF TG_TABLE_NAME='ProductModifierGroup' THEN
  UPDATE public."Product" SET version=version+1,"updatedAt"=clock_timestamp()
   WHERE id=NEW."productId" AND "organizationId"=NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'modifier product outside tenant context' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME<>'ModifierGroup' THEN
  UPDATE public."ModifierGroup" SET version=version+1,"updatedAt"=clock_timestamp()
   WHERE id=NEW."modifierGroupId" AND "organizationId"=NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'modifier group outside tenant context' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_website_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent_xmin xid; product_name text; product_sku text; local_price numeric;
BEGIN
  SELECT xmin INTO parent_xmin FROM public."WebsiteOrder"
    WHERE id=NEW."websiteOrderId" AND "organizationId"=NEW."organizationId"
      AND "locationId"=NEW."locationId" AND status='PENDING';
  IF parent_xmin IS NULL OR parent_xmin::text<>pg_current_xact_id()::text THEN
    RAISE EXCEPTION 'website order items must be sealed with the initial inbox entry' USING ERRCODE='23514';
  END IF;
  SELECT p.name,p.sku,lp.price INTO product_name,product_sku,local_price
    FROM public."Product" p JOIN public."LocationProduct" lp
      ON lp."productId"=p.id AND lp."organizationId"=p."organizationId"
    WHERE p.id=NEW."productId" AND p."organizationId"=NEW."organizationId"
      AND lp."locationId"=NEW."locationId" AND p.status='ACTIVE' AND lp.enabled;
  IF local_price IS NULL OR (NEW."productName",NEW."productSku",NEW."baseUnitPrice")
    IS DISTINCT FROM (product_name,product_sku,local_price) THEN
    RAISE EXCEPTION 'website product snapshots must match the active location catalog' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_website_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE inbox public."WebsiteOrder"; local_order public."Order"; order_xmin xid;
  item_count bigint; local_count bigint; items_total numeric;
BEGIN
  SELECT * INTO inbox FROM public."WebsiteOrder" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
  SELECT count(*),sum("lineTotal") INTO item_count,items_total FROM public."WebsiteOrderItem"
    WHERE "websiteOrderId"=inbox.id AND "organizationId"=inbox."organizationId";
  IF item_count NOT BETWEEN 1 AND 50 OR inbox.total IS DISTINCT FROM items_total THEN
    RAISE EXCEPTION 'website inbox requires 1 to 50 items and their exact total' USING ERRCODE='23514';
  END IF;
  IF inbox.status<>'ACCEPTED' THEN RETURN NULL; END IF;
  SELECT * INTO local_order FROM public."Order"
    WHERE id=inbox."orderId" AND "organizationId"=inbox."organizationId" AND "locationId"=inbox."locationId" FOR UPDATE;
  SELECT xmin INTO order_xmin FROM public."Order" WHERE id=local_order.id AND "organizationId"=inbox."organizationId";
  IF local_order.id IS NULL OR local_order.status<>'DRAFT' OR local_order."kitchenStatus"<>'NOT_SENT'
    OR local_order.version<>1 OR order_xmin::text<>pg_current_xact_id()::text
    OR local_order."tableLabel" IS NOT NULL OR local_order.notes IS NOT NULL
    OR (local_order."serviceType",local_order.currency,local_order.total,local_order."createdByUserId",local_order."updatedByUserId") IS DISTINCT FROM
       (inbox."serviceType",inbox.currency,inbox.total,inbox."decisionByUserId",inbox."decisionByUserId") THEN
    RAISE EXCEPTION 'website acceptance requires a new matching operator draft in the same transaction' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO local_count FROM public."OrderItem"
    WHERE "orderId"=inbox."orderId" AND "organizationId"=inbox."organizationId";
  IF local_count<>item_count OR EXISTS (
    SELECT 1 FROM public."WebsiteOrderItem" w LEFT JOIN public."OrderItem" i
      ON i."organizationId"=w."organizationId" AND i."orderId"=inbox."orderId" AND i.position=w.position
    WHERE w."websiteOrderId"=inbox.id AND w."organizationId"=inbox."organizationId"
      AND (w."productId",w."productName",w."productSku",w."unitPrice",w.quantity,w."lineTotal",w.note,w."baseUnitPrice",public.modifier_line_snapshot(w."organizationId",w."locationId",w.id,true))
      IS DISTINCT FROM (i."productId",i."productName",i."productSku",i."unitPrice",i.quantity,i."lineTotal",i.note,i."baseUnitPrice",public.modifier_line_snapshot(i."organizationId",i."locationId",i.id,false))
  ) THEN RAISE EXCEPTION 'accepted POS draft must preserve all website item snapshots' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

ALTER TABLE public."InventoryReservationLine"
 ALTER COLUMN "recipeComponentId" DROP NOT NULL,
 ADD COLUMN "modifierRecipeComponentId" uuid,
 ADD COLUMN "orderItemModifierId" uuid,
 ADD CONSTRAINT inventory_reservation_source CHECK (
  ("recipeComponentId" IS NOT NULL AND "modifierRecipeComponentId" IS NULL AND "orderItemModifierId" IS NULL)
  OR ("recipeComponentId" IS NULL AND "modifierRecipeComponentId" IS NOT NULL AND "orderItemModifierId" IS NOT NULL)),
 ADD CONSTRAINT inventory_modifier_reservation_source_key UNIQUE ("organizationId","reservationId","orderItemModifierId","modifierRecipeComponentId"),
 ADD FOREIGN KEY ("organizationId","modifierRecipeComponentId") REFERENCES public."ModifierRecipeComponent"("organizationId",id) ON DELETE RESTRICT,
 ADD FOREIGN KEY ("organizationId","locationId","orderItemId","orderItemModifierId") REFERENCES public."OrderItemModifier"("organizationId","locationId","orderItemId",id) ON DELETE RESTRICT;
ALTER TABLE public."InventoryMovement"
 ADD COLUMN "modifierRecipeComponentId" uuid,
 ADD COLUMN "orderItemModifierId" uuid,
 DROP CONSTRAINT inventory_movement_source,
 ADD CONSTRAINT inventory_movement_source CHECK (
  ("orderItemId" IS NULL AND "recipeComponentId" IS NULL AND "modifierRecipeComponentId" IS NULL AND "orderItemModifierId" IS NULL AND "productName" IS NULL)
  OR ("orderItemId" IS NOT NULL AND "productName" IS NOT NULL AND
   (("recipeComponentId" IS NOT NULL AND "modifierRecipeComponentId" IS NULL AND "orderItemModifierId" IS NULL)
    OR ("recipeComponentId" IS NULL AND "modifierRecipeComponentId" IS NOT NULL AND "orderItemModifierId" IS NOT NULL)))),
 ADD FOREIGN KEY ("organizationId","modifierRecipeComponentId") REFERENCES public."ModifierRecipeComponent"("organizationId",id) ON DELETE RESTRICT,
 ADD FOREIGN KEY ("organizationId","locationId","orderItemId","orderItemModifierId") REFERENCES public."OrderItemModifier"("organizationId","locationId","orderItemId",id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX inventory_modifier_consumption_line ON public."InventoryMovement"("organizationId","documentId","orderItemModifierId","modifierRecipeComponentId") WHERE "orderItemModifierId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_inventory_reservation_line() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE reservation public."InventoryReservation"; header_xmin xid; line public."OrderItem";
 component public."RecipeComponent"; recipe public."RecipeVersion"; item public."InventoryItem"; service_type text;
 modifier public."OrderItemModifier"; modifier_component public."ModifierRecipeComponent"; modifier_recipe public."ModifierRecipeVersion";
 component_item uuid; component_quantity numeric; component_services text[]; recipe_product uuid; recipe_version integer; latest_version integer;
BEGIN
 SELECT * INTO reservation FROM public."InventoryReservation" WHERE id=NEW."reservationId" AND "organizationId"=NEW."organizationId";
 SELECT xmin INTO header_xmin FROM public."InventoryReservation" WHERE id=NEW."reservationId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO line FROM public."OrderItem" WHERE id=NEW."orderItemId" AND "organizationId"=NEW."organizationId";
 SELECT * INTO item FROM public."InventoryItem" WHERE id=NEW."inventoryItemId" AND "organizationId"=NEW."organizationId";
 SELECT "serviceType" INTO service_type FROM public."Order" WHERE id=reservation."orderId" AND "organizationId"=NEW."organizationId";
 IF NEW."recipeComponentId" IS NOT NULL THEN
  SELECT * INTO component FROM public."RecipeComponent" WHERE id=NEW."recipeComponentId" AND "organizationId"=NEW."organizationId";
  SELECT * INTO recipe FROM public."RecipeVersion" WHERE id=component."recipeVersionId" AND "organizationId"=NEW."organizationId";
  component_item := component."inventoryItemId"; component_quantity := component."quantityPerUnit"; component_services := component."serviceTypes";
  recipe_product := recipe."productId"; recipe_version := recipe.version;
  SELECT max(version) INTO latest_version FROM public."RecipeVersion" WHERE "productId"=line."productId" AND "organizationId"=NEW."organizationId";
 ELSE
  SELECT * INTO modifier FROM public."OrderItemModifier" WHERE id=NEW."orderItemModifierId" AND "organizationId"=NEW."organizationId";
  SELECT * INTO modifier_component FROM public."ModifierRecipeComponent" WHERE id=NEW."modifierRecipeComponentId" AND "organizationId"=NEW."organizationId";
  SELECT * INTO modifier_recipe FROM public."ModifierRecipeVersion" WHERE id=modifier_component."modifierRecipeVersionId" AND "organizationId"=NEW."organizationId";
  IF modifier."orderItemId" IS DISTINCT FROM line.id OR modifier."modifierOptionId" IS DISTINCT FROM modifier_recipe."modifierOptionId" THEN
   RAISE EXCEPTION 'modifier reservation requires its exact selected option source' USING ERRCODE='23514';
  END IF;
  component_item := modifier_component."inventoryItemId"; component_quantity := modifier_component."quantityPerUnit"; component_services := modifier_component."serviceTypes";
  recipe_product := modifier_recipe."productId"; recipe_version := modifier_recipe.version;
  SELECT max(version) INTO latest_version FROM public."ModifierRecipeVersion" WHERE "productId"=line."productId"
   AND "modifierOptionId"=modifier."modifierOptionId" AND "organizationId"=NEW."organizationId";
 END IF;
 IF header_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid OR reservation.status<>'PENDING'
  OR line."orderId" IS DISTINCT FROM reservation."orderId" OR recipe_product IS DISTINCT FROM line."productId"
  OR recipe_version IS DISTINCT FROM latest_version OR component_item IS DISTINCT FROM NEW."inventoryItemId"
  OR NOT coalesce(service_type=ANY(component_services),false) OR NEW.quantity IS DISTINCT FROM line.quantity*component_quantity
  OR (NEW."itemName",NEW."itemSku",NEW.unit,NEW."productName") IS DISTINCT FROM (item.name,item.sku,item.unit,line."productName") THEN
  RAISE EXCEPTION 'reservation must snapshot the complete current recipe at send' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_inventory_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_count bigint; actual_count bigint; modifier_count bigint; header public."InventoryReservation";
BEGIN
 SELECT * INTO header FROM public."InventoryReservation" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
 IF TG_OP='INSERT' THEN
  IF EXISTS (SELECT 1 FROM public."OrderItem" oi JOIN public."OrderItemModifier" m ON m."organizationId"=oi."organizationId" AND m."orderItemId"=oi.id
   WHERE oi."orderId"=NEW."orderId" AND oi."organizationId"=NEW."organizationId" AND NOT EXISTS (
    SELECT 1 FROM public."ModifierRecipeVersion" v WHERE v."organizationId"=oi."organizationId" AND v."productId"=oi."productId" AND v."modifierOptionId"=m."modifierOptionId")) THEN
   RAISE EXCEPTION 'selected modifier inventory recipe is UNCONFIGURED' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO expected_count FROM public."OrderItem" oi
   JOIN public."Order" o ON o.id=oi."orderId" AND o."organizationId"=oi."organizationId"
   JOIN LATERAL (SELECT id FROM public."RecipeVersion" rv WHERE rv."organizationId"=oi."organizationId"
    AND rv."productId"=oi."productId" ORDER BY version DESC LIMIT 1) latest ON true
   JOIN public."RecipeComponent" rc ON rc."recipeVersionId"=latest.id AND rc."organizationId"=oi."organizationId"
   WHERE oi."orderId"=NEW."orderId" AND oi."organizationId"=NEW."organizationId" AND o."serviceType"=ANY(rc."serviceTypes");
  SELECT count(*) INTO modifier_count FROM public."OrderItem" oi
   JOIN public."Order" o ON o.id=oi."orderId" AND o."organizationId"=oi."organizationId"
   JOIN public."OrderItemModifier" m ON m."organizationId"=oi."organizationId" AND m."orderItemId"=oi.id
   JOIN LATERAL (SELECT id FROM public."ModifierRecipeVersion" rv WHERE rv."organizationId"=oi."organizationId"
    AND rv."productId"=oi."productId" AND rv."modifierOptionId"=m."modifierOptionId" ORDER BY version DESC LIMIT 1) latest ON true
   JOIN public."ModifierRecipeComponent" rc ON rc."modifierRecipeVersionId"=latest.id AND rc."organizationId"=oi."organizationId"
   WHERE oi."orderId"=NEW."orderId" AND oi."organizationId"=NEW."organizationId" AND o."serviceType"=ANY(rc."serviceTypes");
  SELECT count(*) INTO actual_count FROM public."InventoryReservationLine" WHERE "reservationId"=NEW.id AND "organizationId"=NEW."organizationId";
  IF expected_count+modifier_count>2500 OR actual_count<>expected_count+modifier_count THEN
   RAISE EXCEPTION 'reservation requires every base and modifier component within 2500 lines' USING ERRCODE='23514';
  END IF;
 END IF;
 IF header.status='CONSUMED' AND NOT EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "orderId"=header."orderId" AND "organizationId"=header."organizationId" AND kind='CONSUMPTION') THEN
  RAISE EXCEPTION 'consumed reservation requires its ledger document' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
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
      AND (l."inventoryItemId",l."orderItemId",l."recipeComponentId",l."modifierRecipeComponentId",l."orderItemModifierId",-l.quantity,l."itemName",l."itemSku",l.unit,l."productName")
       IS NOT DISTINCT FROM (NEW."inventoryItemId",NEW."orderItemId",NEW."recipeComponentId",NEW."modifierRecipeComponentId",NEW."orderItemModifierId",NEW.quantity,NEW."itemName",NEW."itemSku",NEW.unit,NEW."productName")
    ) THEN
      RAISE EXCEPTION 'consumption must exactly match the immutable send reservation' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW."orderItemId" IS NOT NULL OR NEW."recipeComponentId" IS NOT NULL OR NEW."modifierRecipeComponentId" IS NOT NULL OR NEW."orderItemModifierId" IS NOT NULL OR NEW."productName" IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.prepare_modifier_order_line(),public.protect_modifier_snapshot(),public.check_modifier_line_complete(),public.seal_kitchen_modifiers(),public.check_kitchen_modifiers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.modifier_line_snapshot(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modifier_line_snapshot(uuid,uuid,uuid,boolean) TO pos_runtime;
COMMIT;
