BEGIN;
-- Successful commands are immutable rule versions; null thresholds restore inheritance.
CREATE TABLE "KitchenAlertCommand" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL REFERENCES "Organization"(id),
 "scopeType" text NOT NULL CHECK ("scopeType" IN ('ORGANIZATION','LOCATION')),
 "locationId" uuid,
 "targetKind" text NOT NULL CHECK ("targetKind" IN ('DEFAULT','STATION','CATEGORY','PRODUCT')),
 "stationId" uuid, "categoryId" uuid, "productId" uuid,
 "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "requestHash" text, "expectedVersion" integer, "resultVersion" integer,
 "warningSeconds" integer, "criticalSeconds" integer,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","stationId") REFERENCES "KitchenStation"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","categoryId") REFERENCES "Category"("organizationId",id),
 FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","productId") REFERENCES "LocationProduct"("organizationId","locationId","productId"),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK (("scopeType"='ORGANIZATION' AND "locationId" IS NULL)
     OR ("scopeType"='LOCATION' AND "locationId" IS NOT NULL)),
 CHECK (("targetKind"='DEFAULT' AND num_nonnulls("stationId","categoryId","productId")=0)
     OR ("targetKind"='STATION' AND "stationId" IS NOT NULL AND "scopeType"='LOCATION'
         AND num_nonnulls("stationId","categoryId","productId")=1)
     OR ("targetKind"='CATEGORY' AND "categoryId" IS NOT NULL
         AND num_nonnulls("stationId","categoryId","productId")=1)
     OR ("targetKind"='PRODUCT' AND "productId" IS NOT NULL
         AND num_nonnulls("stationId","categoryId","productId")=1)),
 CHECK (("warningSeconds" IS NULL AND "criticalSeconds" IS NULL)
     OR ("warningSeconds" IS NOT NULL AND "criticalSeconds" IS NOT NULL
         AND "warningSeconds">=1 AND "warningSeconds"<"criticalSeconds" AND "criticalSeconds"<=86400)),
 CHECK ((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
         AND "resultVersion" IS NULL AND "warningSeconds" IS NULL AND "criticalSeconds" IS NULL)
     OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
         AND "expectedVersion" IS NOT NULL AND "expectedVersion" BETWEEN 0 AND 2147483646
         AND "resultVersion" IS NOT NULL AND "resultVersion"="expectedVersion"+1))
);
-- Empty text cannot collide with a UUID; this also works on PostgreSQL before version 15.
CREATE UNIQUE INDEX kitchen_alert_version ON "KitchenAlertCommand"
 ("organizationId",coalesce("locationId"::text,''),"targetKind",
  coalesce("stationId"::text,"categoryId"::text,"productId"::text,''),"resultVersion")
 WHERE status='SUCCEEDED';
CREATE INDEX kitchen_alert_lookup ON "KitchenAlertCommand" ("organizationId","locationId","targetKind","resultVersion" DESC)
 WHERE status='SUCCEEDED';
ALTER TABLE "KitchenAlertCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenAlertCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "KitchenAlertCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "KitchenAlertCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "KitchenAlertCommand" TO pos_runtime;
CREATE TRIGGER kitchen_alert_immutable BEFORE UPDATE OR DELETE ON "KitchenAlertCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.validate_kitchen_alert_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_version integer;
BEGIN
 IF NEW."organizationId" IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
  OR NEW."actorUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  OR NOT EXISTS (SELECT 1 FROM public."Organization" WHERE id=NEW."organizationId" AND status='ACTIVE')
  OR NOT EXISTS (SELECT 1 FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId"
    AND id=NEW."actorUserId" AND status='ACTIVE') THEN
  RAISE EXCEPTION 'alert rule requires current active tenant actor' USING ERRCODE='23514';
 END IF;
 IF NEW."locationId" IS NOT NULL AND NOT public.cash_register_actor_allowed(
  NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'alert rule requires current active scoped actor' USING ERRCODE='23514';
 END IF;
 -- Same transaction lock as the tenant endpoint; permissions remain centralized in the API.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NEW.status='SUCCEEDED' THEN
  SELECT coalesce(max("resultVersion"),0) INTO current_version FROM public."KitchenAlertCommand"
   WHERE "organizationId"=NEW."organizationId" AND "locationId" IS NOT DISTINCT FROM NEW."locationId"
    AND "targetKind"=NEW."targetKind" AND "stationId" IS NOT DISTINCT FROM NEW."stationId"
    AND "categoryId" IS NOT DISTINCT FROM NEW."categoryId" AND "productId" IS NOT DISTINCT FROM NEW."productId"
    AND status='SUCCEEDED';
  IF NEW."expectedVersion" IS DISTINCT FROM current_version THEN
   RAISE EXCEPTION 'alert rule version conflict' USING ERRCODE='23514';
  END IF;
  IF NEW."warningSeconds" IS NOT NULL THEN
   IF NEW."stationId" IS NOT NULL THEN
    PERFORM 1 FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId"
      AND "locationId"=NEW."locationId" AND id=NEW."stationId" AND status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'alert rule requires active station' USING ERRCODE='23514'; END IF;
   END IF;
   IF NEW."categoryId" IS NOT NULL THEN
    PERFORM 1 FROM public."Category" WHERE "organizationId"=NEW."organizationId"
      AND id=NEW."categoryId" AND status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'alert rule requires active category' USING ERRCODE='23514'; END IF;
   END IF;
   IF NEW."productId" IS NOT NULL THEN
    PERFORM 1 FROM public."Product" WHERE "organizationId"=NEW."organizationId"
      AND id=NEW."productId" AND status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'alert rule requires active product' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_alert_validation BEFORE INSERT ON "KitchenAlertCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_alert_command();
REVOKE ALL ON FUNCTION public.validate_kitchen_alert_command() FROM PUBLIC;

CREATE FUNCTION public.notify_kitchen_alert_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE loc uuid;
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  FOR loc IN SELECT id FROM public."Location" WHERE "organizationId"=NEW."organizationId"
   AND (NEW."locationId" IS NULL OR id=NEW."locationId") LOOP
   PERFORM pg_notify('pos_kitchen_changed',json_build_object(
    'organizationId',NEW."organizationId",'locationId',loc)::text);
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_alert_live AFTER INSERT ON "KitchenAlertCommand"
 FOR EACH ROW EXECUTE FUNCTION public.notify_kitchen_alert_change();
REVOKE ALL ON FUNCTION public.notify_kitchen_alert_change() FROM PUBLIC;
COMMIT;
