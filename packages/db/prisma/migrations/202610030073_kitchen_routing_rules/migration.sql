BEGIN;
-- Every successful command is an immutable configuration version; null station clears routing.
CREATE TABLE "KitchenRoutingCommand" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "productId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "requestHash" text, "expectedVersion" integer, "resultVersion" integer,
 "stationId" uuid, "stationCode" text, "stationName" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId","requestKey"),
 UNIQUE ("organizationId","locationId","productId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId","productId") REFERENCES "LocationProduct"("organizationId","locationId","productId"),
 FOREIGN KEY ("organizationId","locationId","stationId") REFERENCES "KitchenStation"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK ((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultVersion" IS NULL AND "stationId" IS NULL AND "stationCode" IS NULL AND "stationName" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion">=0 AND "resultVersion" IS NOT NULL
   AND "resultVersion"="expectedVersion"+1
   AND (("stationId" IS NULL AND "stationCode" IS NULL AND "stationName" IS NULL)
    OR ("stationId" IS NOT NULL AND "stationCode" IS NOT NULL AND "stationName" IS NOT NULL))))
);
ALTER TABLE "KitchenRoutingCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenRoutingCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "KitchenRoutingCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "KitchenRoutingCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "KitchenRoutingCommand" TO pos_runtime;
CREATE TRIGGER kitchen_routing_immutable BEFORE UPDATE OR DELETE ON "KitchenRoutingCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.validate_kitchen_routing_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_version integer; station public."KitchenStation";
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'routing requires current active scoped actor' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public."LocationProduct" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "productId"=NEW."productId" FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'routing requires a product in this location' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  SELECT coalesce(max("resultVersion"),0) INTO current_version FROM public."KitchenRoutingCommand"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "productId"=NEW."productId";
  IF NEW."expectedVersion" IS DISTINCT FROM current_version THEN
   RAISE EXCEPTION 'routing version conflict' USING ERRCODE='23514'; END IF;
  IF NEW."stationId" IS NOT NULL THEN
   SELECT * INTO station FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId"
    AND "locationId"=NEW."locationId" AND id=NEW."stationId" FOR SHARE;
   IF station.id IS NULL OR station.status<>'ACTIVE' THEN
    RAISE EXCEPTION 'routing requires an active station in this location' USING ERRCODE='23514'; END IF;
   NEW."stationCode":=station.code; NEW."stationName":=station.name;
  END IF;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_routing_validation BEFORE INSERT ON "KitchenRoutingCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_routing_command();
REVOKE ALL ON FUNCTION public.validate_kitchen_routing_command() FROM PUBLIC;
COMMIT;
