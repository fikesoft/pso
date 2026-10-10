-- Stații de bucătărie per locație, cu comenzi terminale și istoric imuabil.
BEGIN;
CREATE TABLE "KitchenStation" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{1,20}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name=btrim(name)),
 "sortOrder" integer NOT NULL CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "creationRequestKey" uuid NOT NULL, "lastRequestKey" uuid NOT NULL,
 "lastRequestHash" text NOT NULL CHECK ("lastRequestHash" ~ '^[0-9a-f]{64}$'),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 CONSTRAINT kitchen_station_code_unique UNIQUE ("organizationId","locationId",code),
 CONSTRAINT kitchen_station_creation_unique UNIQUE ("organizationId","locationId","creationRequestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE TABLE "KitchenStationCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('CREATE','UPDATE','ARCHIVE')),
 "actorUserId" uuid NOT NULL, status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "stationId" uuid, "requestHash" text, "expectedVersion" integer,
 "resultSortOrder" integer,
 "resultCode" text, "resultName" text, "resultStatus" text, "resultVersion" integer,
 "resultCreatedAt" timestamptz(3), "resultUpdatedAt" timestamptz(3),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT kitchen_station_command_identity UNIQUE ("organizationId","locationId","requestKey"),
 CONSTRAINT kitchen_station_command_result UNIQUE ("organizationId","stationId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","stationId") REFERENCES "KitchenStation"("organizationId","locationId",id),
 CONSTRAINT kitchen_station_command_shape CHECK (
  (status='SUCCEEDED' AND "stationId" IS NOT NULL AND "requestHash" IS NOT NULL
   AND "requestHash" ~ '^[0-9a-f]{64}$' AND "resultCode" IS NOT NULL AND "resultName" IS NOT NULL
   AND "resultSortOrder" IS NOT NULL AND "resultStatus" IS NOT NULL AND "resultVersion" IS NOT NULL
   AND "resultCreatedAt" IS NOT NULL AND "resultUpdatedAt" IS NOT NULL
   AND ((kind='CREATE' AND "expectedVersion" IS NULL AND "resultVersion"=1 AND "resultStatus"='ACTIVE')
    OR (kind IN ('UPDATE','ARCHIVE') AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
     AND "resultVersion"="expectedVersion"+1
     AND "resultStatus"=CASE kind WHEN 'UPDATE' THEN 'ACTIVE' ELSE 'ARCHIVED' END)))
  OR (status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultSortOrder" IS NULL AND "resultCode" IS NULL AND "resultName" IS NULL AND "resultStatus" IS NULL AND "resultVersion" IS NULL
   AND "resultCreatedAt" IS NULL AND "resultUpdatedAt" IS NULL
   AND ((kind='CREATE' AND "stationId" IS NULL) OR (kind IN ('UPDATE','ARCHIVE') AND "stationId" IS NOT NULL))))
);
ALTER TABLE "KitchenStation" ADD CONSTRAINT kitchen_station_last_command_fk
 FOREIGN KEY ("organizationId","locationId","lastRequestKey")
 REFERENCES "KitchenStationCommand"("organizationId","locationId","requestKey") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "KitchenStation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenStation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "KitchenStationCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenStationCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "KitchenStation" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "KitchenStationCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "KitchenStation","KitchenStationCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "KitchenStation","KitchenStationCommand" TO pos_runtime;
GRANT UPDATE (name,"sortOrder",status,version,"updatedByUserId","updatedAt","lastRequestKey","lastRequestHash") ON "KitchenStation" TO pos_runtime;
CREATE TRIGGER kitchen_station_command_immutable BEFORE UPDATE OR DELETE ON "KitchenStationCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.protect_kitchen_station() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'kitchen stations must be archived, never deleted' USING ERRCODE='23514';
 END IF;
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId") THEN
  RAISE EXCEPTION 'kitchen station requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW.version<>1
   OR NEW."createdByUserId" IS DISTINCT FROM NEW."updatedByUserId"
   OR NEW."creationRequestKey" IS DISTINCT FROM NEW."lastRequestKey" THEN
   RAISE EXCEPTION 'kitchen station requires its initial creation identity' USING ERRCODE='23514';
  END IF;
  NEW."createdAt":=statement_timestamp();
 ELSE
  IF OLD.status<>'ACTIVE' OR NEW.version<>OLD.version+1
   OR NEW."lastRequestKey" IS NOT DISTINCT FROM OLD."lastRequestKey"
   OR (NEW.status='ARCHIVED' AND (NEW.name,NEW."sortOrder") IS DISTINCT FROM (OLD.name,OLD."sortOrder"))
   OR (to_jsonb(NEW)-ARRAY['name','sortOrder','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['name','sortOrder','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash']) THEN
   RAISE EXCEPTION 'kitchen station requires a fresh versioned update or terminal archive' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_station_history BEFORE INSERT OR UPDATE OR DELETE ON "KitchenStation"
 FOR EACH ROW EXECUTE FUNCTION public.protect_kitchen_station();

CREATE FUNCTION public.validate_kitchen_station_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'kitchen station command requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 -- Retirement and update use the same Station -> Command lock order.
 IF NEW."stationId" IS NOT NULL THEN
  PERFORM id FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."stationId" FOR NO KEY UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'kitchen station retirement requires its scoped target' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status='RETIRED' AND EXISTS (SELECT 1 FROM public."KitchenStation" r
  WHERE r."organizationId"=NEW."organizationId" AND r."locationId"=NEW."locationId"
   AND (r."creationRequestKey"=NEW."requestKey" OR r."lastRequestKey"=NEW."requestKey")) THEN
  RAISE EXCEPTION 'cannot retire an applied station key' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_station_command_validation BEFORE INSERT ON "KitchenStationCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_station_command();

CREATE FUNCTION public.check_kitchen_station_effect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."KitchenStation"; c public."KitchenStationCommand"; expected_kind text;
BEGIN
 SELECT * INTO r FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO c FROM public."KitchenStationCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."lastRequestKey";
 expected_kind:=CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN NEW.status='ARCHIVED' THEN 'ARCHIVE' ELSE 'UPDATE' END;
 IF r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM to_jsonb(NEW) OR c.id IS NULL
  OR c.status IS DISTINCT FROM 'SUCCEEDED' OR c.kind IS DISTINCT FROM expected_kind
  OR (c."stationId",c."actorUserId",c."requestHash",c."resultCode",c."resultName",c."resultSortOrder",c."resultStatus",c."resultVersion",c."resultCreatedAt",c."resultUpdatedAt")
   IS DISTINCT FROM (NEW.id,NEW."updatedByUserId",NEW."lastRequestHash",NEW.code,NEW.name,NEW."sortOrder",NEW.status,NEW.version,NEW."createdAt",NEW."updatedAt") THEN
  RAISE EXCEPTION 'kitchen station effect requires its exact current terminal command' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF c."expectedVersion" IS NOT NULL OR NEW."creationRequestKey" IS DISTINCT FROM c."requestKey" THEN
   RAISE EXCEPTION 'kitchen station creation command identity mismatch' USING ERRCODE='23514';
  END IF;
 ELSIF c."expectedVersion" IS DISTINCT FROM OLD.version THEN
  RAISE EXCEPTION 'kitchen station command expected version mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER kitchen_station_effect_consistency AFTER INSERT OR UPDATE ON "KitchenStation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_station_effect();

CREATE FUNCTION public.check_kitchen_station_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."KitchenStation";
BEGIN
 IF NEW.status='RETIRED' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."stationId";
 IF r.id IS NULL
  OR (r."lastRequestKey",r."updatedByUserId",r."lastRequestHash",r.code,r.name,r."sortOrder",r.status,r.version,r."createdAt",r."updatedAt")
   IS DISTINCT FROM (NEW."requestKey",NEW."actorUserId",NEW."requestHash",NEW."resultCode",NEW."resultName",NEW."resultSortOrder",NEW."resultStatus",NEW."resultVersion",NEW."resultCreatedAt",NEW."resultUpdatedAt")
  OR (NEW.kind='CREATE' AND r."creationRequestKey" IS DISTINCT FROM NEW."requestKey") THEN
  RAISE EXCEPTION 'successful kitchen station command requires its exact effect' USING ERRCODE='23514';
 END IF;
 -- No xmin/txid comparison: a previously committed row already has its UNIQUE immutable command.
 -- Another key cannot match lastRequestKey; a duplicate key cannot be inserted.
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER kitchen_station_command_consistency AFTER INSERT ON "KitchenStationCommand"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_station_command();
REVOKE ALL ON FUNCTION public.protect_kitchen_station(),public.validate_kitchen_station_command(),
 public.check_kitchen_station_effect(),public.check_kitchen_station_command() FROM PUBLIC;

INSERT INTO "Permission"(key,label,"scopeTypes",delegable)
 VALUES('kitchen.stations.manage','Administrarea stațiilor de bucătărie',ARRAY['LOCATION'],true);
CREATE INDEX kitchen_station_listing ON "KitchenStation" ("organizationId","locationId",status,"sortOrder",code,id);
COMMIT;
