BEGIN;
CREATE TABLE public."ModifierGroup" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 "minSelections" integer NOT NULL DEFAULT 0,"maxSelections" integer NOT NULL DEFAULT 1,
 "sortOrder" integer NOT NULL DEFAULT 0 CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),"createdByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),"updatedAt" timestamptz(3) NOT NULL,
 CHECK ("minSelections">=0 AND "minSelections"<="maxSelections" AND "maxSelections" BETWEEN 1 AND 10),
 UNIQUE ("organizationId",id),
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE public."ModifierOption" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 "extraPrice" numeric(18,4) NOT NULL CHECK ("extraPrice">=0 AND "extraPrice"<=999999.9999),
 "sortOrder" integer NOT NULL DEFAULT 0 CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),"updatedAt" timestamptz(3) NOT NULL,
 UNIQUE ("organizationId",id),UNIQUE ("organizationId","modifierGroupId",id),
 FOREIGN KEY ("organizationId","modifierGroupId") REFERENCES public."ModifierGroup"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE public."ProductModifierGroup" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"productId" uuid NOT NULL,"modifierGroupId" uuid NOT NULL,
 "sortOrder" integer NOT NULL DEFAULT 0 CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),"updatedAt" timestamptz(3) NOT NULL,
 UNIQUE ("organizationId",id),UNIQUE ("organizationId","productId","modifierGroupId"),
 UNIQUE ("organizationId",id,"modifierGroupId"),
 FOREIGN KEY ("organizationId","productId") REFERENCES public."Product"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","modifierGroupId") REFERENCES public."ModifierGroup"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE public."ModifierRecipeVersion" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"productId" uuid NOT NULL,"modifierOptionId" uuid NOT NULL,
 version integer NOT NULL CHECK (version>0),"requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
 "createdByUserId" uuid NOT NULL,"createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE ("organizationId",id),UNIQUE ("organizationId","productId","modifierOptionId",version),
 UNIQUE ("organizationId","requestKey"),
 FOREIGN KEY ("organizationId","productId") REFERENCES public."Product"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","modifierOptionId") REFERENCES public."ModifierOption"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE public."ModifierRecipeComponent" (
 id uuid PRIMARY KEY,"organizationId" uuid NOT NULL,"modifierRecipeVersionId" uuid NOT NULL,"inventoryItemId" uuid NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
 purpose text NOT NULL CHECK (purpose IN ('MAIN','AUXILIARY','PACKAGING','CONSUMABLE')),
 "quantityPerUnit" numeric(18,3) NOT NULL CHECK ("quantityPerUnit">0 AND "quantityPerUnit"<=999999.999),
 "serviceTypes" text[] NOT NULL,
 CHECK (cardinality("serviceTypes") BETWEEN 1 AND 3 AND array_position("serviceTypes",NULL) IS NULL
  AND "serviceTypes" <@ ARRAY['DINE_IN','TAKEAWAY','DELIVERY']::text[]
  AND cardinality("serviceTypes")=CASE WHEN 'DINE_IN'=ANY("serviceTypes") THEN 1 ELSE 0 END
   +CASE WHEN 'TAKEAWAY'=ANY("serviceTypes") THEN 1 ELSE 0 END+CASE WHEN 'DELIVERY'=ANY("serviceTypes") THEN 1 ELSE 0 END),
 UNIQUE ("organizationId",id),
 CONSTRAINT modifier_recipe_component_item_key UNIQUE ("organizationId","modifierRecipeVersionId","inventoryItemId"),
 CONSTRAINT modifier_recipe_component_position_key UNIQUE ("organizationId","modifierRecipeVersionId",position),
 FOREIGN KEY ("organizationId","modifierRecipeVersionId") REFERENCES public."ModifierRecipeVersion"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","inventoryItemId") REFERENCES public."InventoryItem"("organizationId",id) ON DELETE RESTRICT
);

DO $modifier_security$
DECLARE tab text; tenant text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
 FOREACH tab IN ARRAY ARRAY['ModifierGroup','ModifierOption','ProductModifierGroup','ModifierRecipeVersion','ModifierRecipeComponent'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',tab);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO pos_runtime',tab);
  EXECUTE format('CREATE POLICY modifier_tenant ON public.%I TO pos_runtime USING (%s) WITH CHECK (%s)',tab,tenant,tenant);
  EXECUTE format('CREATE TRIGGER modifier_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',tab);
 END LOOP;
END $modifier_security$;
GRANT UPDATE ON public."ModifierGroup",public."ModifierOption",public."ProductModifierGroup" TO pos_runtime;
CREATE TRIGGER modifier_recipe_immutable BEFORE UPDATE ON public."ModifierRecipeVersion"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER modifier_component_immutable BEFORE UPDATE ON public."ModifierRecipeComponent"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.protect_modifier_catalog() RETURNS trigger
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
 IF TG_TABLE_NAME<>'ModifierGroup' THEN
  UPDATE public."ModifierGroup" SET version=version+1,"updatedAt"=clock_timestamp()
   WHERE id=NEW."modifierGroupId" AND "organizationId"=NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'modifier group outside tenant context' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='ProductModifierGroup' THEN
  UPDATE public."Product" SET version=version+1,"updatedAt"=clock_timestamp()
   WHERE id=NEW."productId" AND "organizationId"=NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'modifier product outside tenant context' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER modifier_group_version BEFORE UPDATE ON public."ModifierGroup" FOR EACH ROW EXECUTE FUNCTION public.protect_modifier_catalog();
CREATE TRIGGER modifier_option_version BEFORE INSERT OR UPDATE ON public."ModifierOption" FOR EACH ROW EXECUTE FUNCTION public.protect_modifier_catalog();
CREATE TRIGGER modifier_binding_version BEFORE INSERT OR UPDATE ON public."ProductModifierGroup" FOR EACH ROW EXECUTE FUNCTION public.protect_modifier_catalog();

CREATE FUNCTION public.check_modifier_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE group_id uuid; group_row public."ModifierGroup"; available_count integer; bound boolean;
BEGIN
 IF TG_TABLE_NAME='ModifierGroup' THEN group_id := NEW.id; ELSE group_id := NEW."modifierGroupId"; END IF;
 SELECT * INTO group_row FROM public."ModifierGroup" WHERE id=group_id AND "organizationId"=NEW."organizationId";
 SELECT count(*) INTO available_count FROM public."ModifierOption" WHERE "organizationId"=NEW."organizationId" AND "modifierGroupId"=group_id AND status='ACTIVE';
 SELECT EXISTS(SELECT 1 FROM public."ProductModifierGroup" WHERE "organizationId"=NEW."organizationId" AND "modifierGroupId"=group_id AND status='ACTIVE') INTO bound;
 IF available_count>20 OR (bound AND (group_row.status<>'ACTIVE' OR available_count<group_row."minSelections")) THEN
  RAISE EXCEPTION 'active modifier bindings must remain satisfiable with at most twenty options' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='ProductModifierGroup' AND (SELECT count(*) FROM public."ProductModifierGroup"
  WHERE "organizationId"=NEW."organizationId" AND "productId"=NEW."productId" AND status='ACTIVE')>10 THEN
  RAISE EXCEPTION 'product permits at most ten active modifier groups' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER modifier_group_complete AFTER INSERT OR UPDATE ON public."ModifierGroup"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_modifier_configuration();
CREATE CONSTRAINT TRIGGER modifier_option_complete AFTER INSERT OR UPDATE ON public."ModifierOption"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_modifier_configuration();
CREATE CONSTRAINT TRIGGER modifier_binding_complete AFTER INSERT OR UPDATE ON public."ProductModifierGroup"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_modifier_configuration();

CREATE FUNCTION public.validate_modifier_recipe() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE next_version integer; version_xmin xid; item public."InventoryItem";
BEGIN
 IF TG_TABLE_NAME='ModifierRecipeVersion' THEN
  PERFORM id FROM public."Product" WHERE id=NEW."productId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public."ModifierOption" o JOIN public."ProductModifierGroup" b
   ON b."organizationId"=o."organizationId" AND b."modifierGroupId"=o."modifierGroupId"
   WHERE o.id=NEW."modifierOptionId" AND o."organizationId"=NEW."organizationId" AND b."productId"=NEW."productId"
    AND o.status='ACTIVE' AND b.status='ACTIVE') THEN
   RAISE EXCEPTION 'modifier recipe requires its active product option binding' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM public."ModifierRecipeVersion"
   WHERE "organizationId"=NEW."organizationId" AND "productId"=NEW."productId" AND "modifierOptionId"=NEW."modifierOptionId";
  IF NEW.version<>next_version THEN RAISE EXCEPTION 'modifier recipe version must follow latest' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT xmin INTO version_xmin FROM public."ModifierRecipeVersion" WHERE id=NEW."modifierRecipeVersionId" AND "organizationId"=NEW."organizationId";
  SELECT * INTO item FROM public."InventoryItem" WHERE id=NEW."inventoryItemId" AND "organizationId"=NEW."organizationId";
  IF version_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid OR item.status IS DISTINCT FROM 'ACTIVE'
   OR NOT ((item.kind='INGREDIENT' AND NEW.purpose IN ('MAIN','AUXILIARY')) OR (item.kind='PACKAGING' AND NEW.purpose='PACKAGING')
    OR (item.kind='CONSUMABLE' AND NEW.purpose='CONSUMABLE')) THEN
   RAISE EXCEPTION 'modifier recipe components require compatible active items in creation transaction' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER modifier_recipe_creation BEFORE INSERT ON public."ModifierRecipeVersion" FOR EACH ROW EXECUTE FUNCTION public.validate_modifier_recipe();
CREATE TRIGGER modifier_component_creation BEFORE INSERT ON public."ModifierRecipeComponent" FOR EACH ROW EXECUTE FUNCTION public.validate_modifier_recipe();
REVOKE ALL ON FUNCTION public.protect_modifier_catalog(),public.check_modifier_configuration(),public.validate_modifier_recipe() FROM PUBLIC;
COMMIT;
