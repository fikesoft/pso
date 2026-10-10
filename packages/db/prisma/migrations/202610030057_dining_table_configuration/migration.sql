-- Configurarea meselor; vizitele sunt adăugate separat, fără backfill istoric.
BEGIN;
CREATE TABLE "DiningTable" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{1,20}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name=btrim(name)),
 capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 999),
 "sortOrder" integer NOT NULL CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "creationRequestKey" uuid NOT NULL, "lastRequestKey" uuid NOT NULL,
 "lastRequestHash" text NOT NULL CHECK ("lastRequestHash" ~ '^[0-9a-f]{64}$'),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 CONSTRAINT dining_table_code_unique UNIQUE ("organizationId","locationId",code),
 CONSTRAINT dining_table_creation_unique UNIQUE ("organizationId","locationId","creationRequestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE TABLE "DiningTableCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('CREATE','UPDATE','ARCHIVE')),
 "actorUserId" uuid NOT NULL, status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "tableId" uuid, "requestHash" text, "expectedVersion" integer,
 "resultCapacity" integer, "resultSortOrder" integer,
 "resultCode" text, "resultName" text, "resultStatus" text, "resultVersion" integer,
 "resultCreatedAt" timestamptz(3), "resultUpdatedAt" timestamptz(3),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT dining_table_command_identity UNIQUE ("organizationId","locationId","requestKey"),
 CONSTRAINT dining_table_command_result UNIQUE ("organizationId","tableId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","tableId") REFERENCES "DiningTable"("organizationId","locationId",id),
 CONSTRAINT dining_table_command_shape CHECK (
  (status='SUCCEEDED' AND "tableId" IS NOT NULL AND "requestHash" IS NOT NULL
   AND "requestHash" ~ '^[0-9a-f]{64}$' AND "resultCode" IS NOT NULL AND "resultName" IS NOT NULL
   AND "resultCapacity" IS NOT NULL AND "resultSortOrder" IS NOT NULL AND "resultStatus" IS NOT NULL AND "resultVersion" IS NOT NULL
   AND "resultCreatedAt" IS NOT NULL AND "resultUpdatedAt" IS NOT NULL
   AND ((kind='CREATE' AND "expectedVersion" IS NULL AND "resultVersion"=1 AND "resultStatus"='ACTIVE')
    OR (kind IN ('UPDATE','ARCHIVE') AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
     AND "resultVersion"="expectedVersion"+1
     AND "resultStatus"=CASE kind WHEN 'UPDATE' THEN 'ACTIVE' ELSE 'ARCHIVED' END)))
  OR (status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultCapacity" IS NULL AND "resultSortOrder" IS NULL AND "resultCode" IS NULL AND "resultName" IS NULL AND "resultStatus" IS NULL AND "resultVersion" IS NULL
   AND "resultCreatedAt" IS NULL AND "resultUpdatedAt" IS NULL
   AND ((kind='CREATE' AND "tableId" IS NULL) OR (kind IN ('UPDATE','ARCHIVE') AND "tableId" IS NOT NULL))))
);
ALTER TABLE "DiningTable" ADD CONSTRAINT dining_table_last_command_fk
 FOREIGN KEY ("organizationId","locationId","lastRequestKey")
 REFERENCES "DiningTableCommand"("organizationId","locationId","requestKey") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "DiningTable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiningTable" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DiningTableCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiningTableCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DiningTable" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "DiningTableCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DiningTable","DiningTableCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "DiningTable","DiningTableCommand" TO pos_runtime;
GRANT UPDATE (name,capacity,"sortOrder",status,version,"updatedByUserId","updatedAt","lastRequestKey","lastRequestHash") ON "DiningTable" TO pos_runtime;
CREATE TRIGGER dining_table_command_immutable BEFORE UPDATE OR DELETE ON "DiningTableCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.protect_dining_table() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'dining tables must be archived, never deleted' USING ERRCODE='23514';
 END IF;
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId") THEN
  RAISE EXCEPTION 'dining table requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW.version<>1
   OR NEW."createdByUserId" IS DISTINCT FROM NEW."updatedByUserId"
   OR NEW."creationRequestKey" IS DISTINCT FROM NEW."lastRequestKey" THEN
   RAISE EXCEPTION 'dining table requires its initial creation identity' USING ERRCODE='23514';
  END IF;
  NEW."createdAt":=statement_timestamp();
 ELSE
  IF OLD.status<>'ACTIVE' OR NEW.version<>OLD.version+1
   OR NEW."lastRequestKey" IS NOT DISTINCT FROM OLD."lastRequestKey"
   OR (NEW.status='ARCHIVED' AND (NEW.name,NEW.capacity,NEW."sortOrder") IS DISTINCT FROM (OLD.name,OLD.capacity,OLD."sortOrder"))
   OR (to_jsonb(NEW)-ARRAY['name','capacity','sortOrder','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['name','capacity','sortOrder','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash']) THEN
   RAISE EXCEPTION 'dining table requires a fresh versioned update or terminal archive' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER dining_table_history BEFORE INSERT OR UPDATE OR DELETE ON "DiningTable"
 FOR EACH ROW EXECUTE FUNCTION public.protect_dining_table();

CREATE FUNCTION public.validate_dining_table_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'dining table command requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 -- Retirement and update use the same Table -> Command lock order.
 IF NEW."tableId" IS NOT NULL THEN
  PERFORM id FROM public."DiningTable" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."tableId" FOR NO KEY UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'dining table retirement requires its scoped target' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status='RETIRED' AND EXISTS (SELECT 1 FROM public."DiningTable" r
  WHERE r."organizationId"=NEW."organizationId" AND r."locationId"=NEW."locationId"
   AND (r."creationRequestKey"=NEW."requestKey" OR r."lastRequestKey"=NEW."requestKey")) THEN
  RAISE EXCEPTION 'cannot retire an applied table key' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER dining_table_command_validation BEFORE INSERT ON "DiningTableCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_dining_table_command();

CREATE FUNCTION public.check_dining_table_effect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."DiningTable"; c public."DiningTableCommand"; expected_kind text;
BEGIN
 SELECT * INTO r FROM public."DiningTable" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO c FROM public."DiningTableCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."lastRequestKey";
 expected_kind:=CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN NEW.status='ARCHIVED' THEN 'ARCHIVE' ELSE 'UPDATE' END;
 IF r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM to_jsonb(NEW) OR c.id IS NULL
  OR c.status IS DISTINCT FROM 'SUCCEEDED' OR c.kind IS DISTINCT FROM expected_kind
  OR (c."tableId",c."actorUserId",c."requestHash",c."resultCode",c."resultName",c."resultCapacity",c."resultSortOrder",c."resultStatus",c."resultVersion",c."resultCreatedAt",c."resultUpdatedAt")
   IS DISTINCT FROM (NEW.id,NEW."updatedByUserId",NEW."lastRequestHash",NEW.code,NEW.name,NEW.capacity,NEW."sortOrder",NEW.status,NEW.version,NEW."createdAt",NEW."updatedAt") THEN
  RAISE EXCEPTION 'dining table effect requires its exact current terminal command' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF c."expectedVersion" IS NOT NULL OR NEW."creationRequestKey" IS DISTINCT FROM c."requestKey" THEN
   RAISE EXCEPTION 'dining table creation command identity mismatch' USING ERRCODE='23514';
  END IF;
 ELSIF c."expectedVersion" IS DISTINCT FROM OLD.version THEN
  RAISE EXCEPTION 'dining table command expected version mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER dining_table_effect_consistency AFTER INSERT OR UPDATE ON "DiningTable"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_dining_table_effect();

CREATE FUNCTION public.check_dining_table_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."DiningTable";
BEGIN
 IF NEW.status='RETIRED' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public."DiningTable" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."tableId";
 IF r.id IS NULL
  OR (r."lastRequestKey",r."updatedByUserId",r."lastRequestHash",r.code,r.name,r.capacity,r."sortOrder",r.status,r.version,r."createdAt",r."updatedAt")
   IS DISTINCT FROM (NEW."requestKey",NEW."actorUserId",NEW."requestHash",NEW."resultCode",NEW."resultName",NEW."resultCapacity",NEW."resultSortOrder",NEW."resultStatus",NEW."resultVersion",NEW."resultCreatedAt",NEW."resultUpdatedAt")
  OR (NEW.kind='CREATE' AND r."creationRequestKey" IS DISTINCT FROM NEW."requestKey") THEN
  RAISE EXCEPTION 'successful dining table command requires its exact effect' USING ERRCODE='23514';
 END IF;
 -- No xmin/txid comparison: a previously committed row already has its UNIQUE immutable command.
 -- Another key cannot match lastRequestKey; a duplicate key cannot be inserted.
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER dining_table_command_consistency AFTER INSERT ON "DiningTableCommand"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_dining_table_command();
REVOKE ALL ON FUNCTION public.protect_dining_table(),public.validate_dining_table_command(),
 public.check_dining_table_effect(),public.check_dining_table_command() FROM PUBLIC;

CREATE INDEX dining_table_listing ON "DiningTable" ("organizationId","locationId",status,"sortOrder",code,id);
COMMIT;
