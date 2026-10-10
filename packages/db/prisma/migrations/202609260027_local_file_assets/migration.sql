BEGIN;

CREATE TABLE public."FileAsset" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid,
 purpose text NOT NULL,
 "employeeId" uuid,
 "productId" uuid,
 "storageKey" text NOT NULL UNIQUE,
 "mimeType" text NOT NULL CHECK ("mimeType"='image/webp'),
 size integer NOT NULL CHECK (size BETWEEN 1 AND 2097152),
 width integer NOT NULL CHECK (width>0),
 height integer NOT NULL CHECK (height>0),
 checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
 "createdByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT file_asset_binding CHECK (
  (purpose='STAFF_AVATAR' AND "employeeId" IS NOT NULL AND "productId" IS NULL AND width<=512 AND height<=512)
  OR (purpose='PRODUCT_IMAGE' AND "productId" IS NOT NULL AND "employeeId" IS NULL AND width<=1280 AND height<=1280)),
 -- These two purposes belong to organization-wide resources. Future location assets
 -- require an explicit new purpose, policy and migration rather than scope guessing.
 CONSTRAINT file_asset_organization_scope CHECK ("locationId" IS NULL),
 CONSTRAINT file_asset_storage_key CHECK ("storageKey"="organizationId"::text||'/'||id::text||'.webp'),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId",id,"employeeId"),
 UNIQUE ("organizationId",id,"productId"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES public."Location"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","employeeId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","productId") REFERENCES public."Product"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "FileAsset_organizationId_employeeId_idx" ON public."FileAsset"("organizationId","employeeId");
CREATE INDEX "FileAsset_organizationId_productId_idx" ON public."FileAsset"("organizationId","productId");

ALTER TABLE public."CompanyUser" ADD COLUMN "avatarAssetId" uuid,
 ADD CONSTRAINT employee_avatar_asset_fk FOREIGN KEY ("organizationId","avatarAssetId",id)
 REFERENCES public."FileAsset"("organizationId",id,"employeeId") ON DELETE RESTRICT;
ALTER TABLE public."Product" ADD COLUMN "imageAssetId" uuid,
 ADD CONSTRAINT product_image_asset_fk FOREIGN KEY ("organizationId","imageAssetId",id)
 REFERENCES public."FileAsset"("organizationId",id,"productId") ON DELETE RESTRICT;

CREATE TABLE public."FileAssetMutation" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL,
 purpose text NOT NULL,
 "employeeId" uuid,
 "productId" uuid,
 action text NOT NULL CHECK (action IN ('SET','CLEAR')),
 "assetId" uuid,
 "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "resourceVersion" integer NOT NULL CHECK ("resourceVersion">1),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT file_asset_mutation_binding CHECK (
  (purpose='STAFF_AVATAR' AND "employeeId" IS NOT NULL AND "productId" IS NULL)
  OR (purpose='PRODUCT_IMAGE' AND "productId" IS NOT NULL AND "employeeId" IS NULL)),
 CONSTRAINT file_asset_mutation_action CHECK ((action='SET')=("assetId" IS NOT NULL)),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","actorUserId","requestKey"),
 UNIQUE ("organizationId","employeeId","resourceVersion"),
 UNIQUE ("organizationId","productId","resourceVersion"),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","employeeId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","productId") REFERENCES public."Product"("organizationId",id) ON DELETE RESTRICT,
 CONSTRAINT file_asset_mutation_employee_fk FOREIGN KEY ("organizationId","assetId","employeeId")
  REFERENCES public."FileAsset"("organizationId",id,"employeeId") ON DELETE RESTRICT,
 CONSTRAINT file_asset_mutation_product_fk FOREIGN KEY ("organizationId","assetId","productId")
  REFERENCES public."FileAsset"("organizationId",id,"productId") ON DELETE RESTRICT
);

DO $asset_security$
DECLARE table_name text; actor_column text;
 tenant text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['FileAsset','FileAssetMutation'] LOOP
  actor_column := CASE WHEN table_name='FileAsset' THEN 'createdByUserId' ELSE 'actorUserId' END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO pos_runtime',table_name);
  EXECUTE format('CREATE POLICY asset_read ON public.%I FOR SELECT TO pos_runtime USING (%s)',table_name,tenant);
  EXECUTE format('CREATE POLICY asset_create ON public.%I FOR INSERT TO pos_runtime WITH CHECK (%s AND %I=nullif(current_setting(''app.user_id'',true),'''')::uuid)',table_name,tenant,actor_column);
  EXECUTE format('CREATE TRIGGER asset_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',table_name);
 END LOOP;
END $asset_security$;

CREATE FUNCTION public.validate_file_asset_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_version integer; current_asset uuid;
BEGIN
 NEW."createdAt" := clock_timestamp()::timestamptz(3);
 IF TG_TABLE_NAME='FileAssetMutation' THEN
  -- Parent update has already acquired its row lock. The ledger records that exact
  -- committed outcome, not arbitrary JSON or a snapshot supplied by the browser.
  IF NEW.purpose='STAFF_AVATAR' THEN
   SELECT version,"avatarAssetId" INTO current_version,current_asset FROM public."CompanyUser"
    WHERE "organizationId"=NEW."organizationId" AND id=NEW."employeeId" FOR UPDATE;
  ELSE
   SELECT version,"imageAssetId" INTO current_version,current_asset FROM public."Product"
    WHERE "organizationId"=NEW."organizationId" AND id=NEW."productId" FOR UPDATE;
  END IF;
  IF current_version IS DISTINCT FROM NEW."resourceVersion" OR current_asset IS DISTINCT FROM NEW."assetId" THEN
   RAISE EXCEPTION 'file asset mutation must snapshot the updated resource' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER file_asset_insert BEFORE INSERT ON public."FileAsset"
 FOR EACH ROW EXECUTE FUNCTION public.validate_file_asset_insert();
CREATE TRIGGER file_asset_mutation_insert BEFORE INSERT ON public."FileAssetMutation"
 FOR EACH ROW EXECUTE FUNCTION public.validate_file_asset_insert();

CREATE FUNCTION public.protect_employee_avatar_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."avatarAssetId" IS DISTINCT FROM OLD."avatarAssetId" AND NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'avatar change requires resource version increment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_avatar_version BEFORE UPDATE ON public."CompanyUser"
 FOR EACH ROW EXECUTE FUNCTION public.protect_employee_avatar_version();

CREATE FUNCTION public.check_file_asset_mutation_written() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE asset_id uuid; employee_id uuid; product_id uuid;
BEGIN
 IF TG_TABLE_NAME='CompanyUser' THEN
  IF NEW."avatarAssetId" IS NOT DISTINCT FROM OLD."avatarAssetId" THEN RETURN NULL; END IF;
  asset_id := NEW."avatarAssetId"; employee_id := NEW.id;
 ELSE
  IF NEW."imageAssetId" IS NOT DISTINCT FROM OLD."imageAssetId" THEN RETURN NULL; END IF;
  asset_id := NEW."imageAssetId"; product_id := NEW.id;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public."FileAssetMutation" WHERE "organizationId"=NEW."organizationId"
  AND "employeeId" IS NOT DISTINCT FROM employee_id AND "productId" IS NOT DISTINCT FROM product_id
  AND "resourceVersion"=NEW.version AND "assetId" IS NOT DISTINCT FROM asset_id) THEN
  RAISE EXCEPTION 'file asset pointer changes require an immutable mutation' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER employee_avatar_mutation_complete AFTER UPDATE ON public."CompanyUser"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_file_asset_mutation_written();
CREATE CONSTRAINT TRIGGER product_image_mutation_complete AFTER UPDATE ON public."Product"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_file_asset_mutation_written();
REVOKE ALL ON FUNCTION public.validate_file_asset_insert(),public.protect_employee_avatar_version(),public.check_file_asset_mutation_written()
 FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
COMMIT;
