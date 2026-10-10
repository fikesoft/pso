BEGIN;
CREATE FUNCTION public.delivery_coordinate_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN jsonb_typeof(p)='object' AND (SELECT count(*) FROM jsonb_object_keys(p))=2
  AND jsonb_typeof(p->'latitude')='number' AND jsonb_typeof(p->'longitude')='number'
  AND (p->>'latitude')::numeric BETWEEN -90 AND 90 AND (p->>'longitude')::numeric BETWEEN -180 AND 180;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE FUNCTION public.delivery_cross(a jsonb,b jsonb,c jsonb) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT ((b->>'longitude')::float8-(a->>'longitude')::float8)*((c->>'latitude')::float8-(a->>'latitude')::float8)
 -((b->>'latitude')::float8-(a->>'latitude')::float8)*((c->>'longitude')::float8-(a->>'longitude')::float8)
$$;
CREATE FUNCTION public.delivery_on_segment(a jsonb,b jsonb,p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT abs(public.delivery_cross(a,b,p))<=1e-10
 AND (p->>'longitude')::float8 BETWEEN least((a->>'longitude')::float8,(b->>'longitude')::float8)-1e-10 AND greatest((a->>'longitude')::float8,(b->>'longitude')::float8)+1e-10
 AND (p->>'latitude')::float8 BETWEEN least((a->>'latitude')::float8,(b->>'latitude')::float8)-1e-10 AND greatest((a->>'latitude')::float8,(b->>'latitude')::float8)+1e-10
$$;
CREATE FUNCTION public.delivery_polygon_valid(points jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE n integer; i integer; j integer; a jsonb; b jsonb; c jsonb; d jsonb; area float8:=0;
 ab_c float8; ab_d float8; cd_a float8; cd_b float8;
BEGIN
 IF jsonb_typeof(points)<>'array' THEN RETURN false; END IF;
 n:=jsonb_array_length(points); IF n<3 OR n>50 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(points) p WHERE public.delivery_coordinate_valid(p) IS DISTINCT FROM true)
  OR (SELECT count(DISTINCT p) FROM jsonb_array_elements(points) p)<>n
  OR (SELECT max((p->>'longitude')::float8)-min((p->>'longitude')::float8) FROM jsonb_array_elements(points) p)>=180 THEN RETURN false; END IF;
 FOR i IN 0..n-1 LOOP
  a:=points->i; b:=points->((i+1)%n); c:=points->((i+n-1)%n);
  IF public.delivery_on_segment(c,a,b) OR public.delivery_on_segment(a,b,c) THEN RETURN false; END IF;
  area:=area+(a->>'longitude')::float8*(b->>'latitude')::float8-(b->>'longitude')::float8*(a->>'latitude')::float8;
  FOR j IN i+1..n-1 LOOP
   IF j=i+1 OR (i=0 AND j=n-1) THEN CONTINUE; END IF;
   c:=points->j; d:=points->((j+1)%n);
   ab_c:=public.delivery_cross(a,b,c); ab_d:=public.delivery_cross(a,b,d);
   cd_a:=public.delivery_cross(c,d,a); cd_b:=public.delivery_cross(c,d,b);
   IF (ab_c*ab_d<0 AND cd_a*cd_b<0) OR public.delivery_on_segment(a,b,c) OR public.delivery_on_segment(a,b,d)
    OR public.delivery_on_segment(c,d,a) OR public.delivery_on_segment(c,d,b) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN abs(area)>1e-10;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE FUNCTION public.delivery_zone_profile_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE shape jsonb; hours jsonb; w jsonb; other jsonb; i integer; j integer; v text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k)
  IS DISTINCT FROM ARRAY['activeHours','deliveryFee','estimatedMinutes','freeDeliveryFrom','minimumOrder','name','priority','shape'] THEN RETURN false; END IF;
 IF jsonb_typeof(p->'name')<>'string' OR length(p->>'name') NOT BETWEEN 1 AND 120 OR btrim(p->>'name')<>p->>'name' THEN RETURN false; END IF;
 FOREACH v IN ARRAY ARRAY['minimumOrder','deliveryFee'] LOOP
  IF jsonb_typeof(p->v)<>'string' OR (p->>v)!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$' THEN RETURN false; END IF;
 END LOOP;
 IF p->'freeDeliveryFrom'<>'null'::jsonb AND (jsonb_typeof(p->'freeDeliveryFrom')<>'string'
  OR (p->>'freeDeliveryFrom')!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$'
  OR (p->>'freeDeliveryFrom')::numeric<(p->>'minimumOrder')::numeric) THEN RETURN false; END IF;
 IF jsonb_typeof(p->'estimatedMinutes')<>'number' OR (p->>'estimatedMinutes')!~'^[0-9]+$'
  OR (p->>'estimatedMinutes')::numeric NOT BETWEEN 1 AND 1440
  OR jsonb_typeof(p->'priority')<>'number' OR (p->>'priority')!~'^[0-9]+$' OR (p->>'priority')::numeric NOT BETWEEN 0 AND 999 THEN RETURN false; END IF;
 shape:=p->'shape'; IF jsonb_typeof(shape)<>'object' THEN RETURN false; END IF;
 IF shape->>'type'='RADIUS' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape) k) IS DISTINCT FROM ARRAY['center','radiusMeters','type']
   OR public.delivery_coordinate_valid(shape->'center') IS DISTINCT FROM true OR jsonb_typeof(shape->'radiusMeters')<>'number'
   OR (shape->>'radiusMeters')!~'^[0-9]+$' OR (shape->>'radiusMeters')::numeric NOT BETWEEN 1 AND 100000 THEN RETURN false; END IF;
 ELSIF shape->>'type'='POLYGON' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape) k) IS DISTINCT FROM ARRAY['type','vertices']
   OR public.delivery_polygon_valid(shape->'vertices') IS DISTINCT FROM true THEN RETURN false; END IF;
 ELSE RETURN false; END IF;
 hours:=p->'activeHours'; IF jsonb_typeof(hours)<>'array' OR jsonb_array_length(hours)>28 THEN RETURN false; END IF;
 FOR i IN 0..jsonb_array_length(hours)-1 LOOP
  w:=hours->i;
  IF jsonb_typeof(w)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(w) k) IS DISTINCT FROM ARRAY['endMinute','startMinute','weekday'] THEN RETURN false; END IF;
  FOREACH v IN ARRAY ARRAY['weekday','startMinute','endMinute'] LOOP
   IF jsonb_typeof(w->v)<>'number' OR (w->>v)!~'^[0-9]+$' THEN RETURN false; END IF;
  END LOOP;
  IF (w->>'weekday')::int NOT BETWEEN 1 AND 7 OR (w->>'startMinute')::int NOT BETWEEN 0 AND 1439
   OR (w->>'endMinute')::int NOT BETWEEN 1 AND 1440 OR (w->>'startMinute')::int>=(w->>'endMinute')::int THEN RETURN false; END IF;
  FOR j IN i+1..jsonb_array_length(hours)-1 LOOP
   other:=hours->j;
   IF w->>'weekday'=other->>'weekday' AND (w->>'startMinute')::int<(other->>'endMinute')::int
    AND (other->>'startMinute')::int<(w->>'endMinute')::int THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;

CREATE TABLE "DeliveryZone" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 profile jsonb NOT NULL CHECK(public.delivery_zone_profile_valid(profile) IS TRUE),
 status text NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED')), version integer NOT NULL CHECK(version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "lastCommandId" uuid NOT NULL,
 UNIQUE("organizationId",id), UNIQUE("organizationId","locationId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE INDEX delivery_zone_location_page ON "DeliveryZone"("organizationId","locationId",status,id);
CREATE TABLE "DeliveryZoneCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "zoneId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('CREATE','UPDATE','ARCHIVE','RESTORE')),
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer, "resultStatus" text, "resultZoneId" uuid,
 profile jsonb, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","locationId","zoneId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","locationId","resultZoneId") REFERENCES "DeliveryZone"("organizationId","locationId",id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL AND "resultVersion" IS NULL AND "resultStatus" IS NULL AND "resultZoneId" IS NULL AND profile IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash"~'^[0-9a-f]{64}$'
   AND "resultZoneId" IS NOT NULL AND "resultZoneId"="zoneId" AND "resultVersion" IS NOT NULL AND "resultVersion">0
   AND "resultStatus" IS NOT NULL AND "resultStatus" IN ('ACTIVE','ARCHIVED') AND profile IS NOT NULL AND public.delivery_zone_profile_valid(profile) IS TRUE
   AND ((action='CREATE' AND "expectedVersion" IS NULL AND "resultVersion"=1)
    OR (action<>'CREATE' AND "expectedVersion" IS NOT NULL AND "expectedVersion">0 AND "resultVersion"::bigint="expectedVersion"::bigint+1))))
);
CREATE UNIQUE INDEX delivery_zone_command_version ON "DeliveryZoneCommand"("organizationId","zoneId","resultVersion") WHERE status='SUCCEEDED';
ALTER TABLE "DeliveryZone" ADD FOREIGN KEY("organizationId","locationId",id,"lastCommandId") REFERENCES "DeliveryZoneCommand"("organizationId","locationId","zoneId",id);
ALTER TABLE "DeliveryZone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryZone" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryZoneCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryZoneCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DeliveryZone" TO pos_runtime USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "DeliveryZoneCommand" TO pos_runtime USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DeliveryZone","DeliveryZoneCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "DeliveryZone","DeliveryZoneCommand" TO pos_runtime;
GRANT UPDATE(profile,status,version,"updatedByUserId","updatedAt","lastCommandId") ON "DeliveryZone" TO pos_runtime;
CREATE TRIGGER delivery_zone_command_immutable BEFORE UPDATE OR DELETE ON "DeliveryZoneCommand" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.delivery_zone_actor_allowed(org uuid,loc uuid,actor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT actor IS NOT DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM public."Location" l WHERE l."organizationId"=org AND l.id=loc AND l.status='ACTIVE')
  AND EXISTS(SELECT 1 FROM public."CompanyUser" u WHERE u."organizationId"=org AND u.id=actor AND u.status='ACTIVE'
   AND (u."isPrimaryAdmin" OR EXISTS(SELECT 1 FROM public."UserLocationAccess" a WHERE a."organizationId"=org AND a."locationId"=loc AND a."userId"=actor)))
$$;
CREATE FUNCTION public.validate_delivery_zone_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE zone public."DeliveryZone";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'delivery zone requires active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO zone FROM public."DeliveryZone" WHERE "organizationId"=NEW."organizationId" AND id=NEW."zoneId" FOR UPDATE;
 IF zone.id IS NOT NULL AND zone."locationId"<>NEW."locationId" THEN RAISE EXCEPTION 'zone location mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  IF NEW.action='CREATE' THEN
   IF zone.id IS NOT NULL OR NEW."expectedVersion" IS NOT NULL THEN RAISE EXCEPTION 'zone already exists' USING ERRCODE='23514'; END IF;
   NEW."resultVersion":=1; NEW."resultStatus":='ACTIVE';
  ELSE
   IF zone.id IS NULL OR NEW."expectedVersion" IS DISTINCT FROM zone.version OR zone.version=2147483647
    OR (NEW.action='RESTORE' AND zone.status<>'ARCHIVED') OR (NEW.action IN ('UPDATE','ARCHIVE') AND zone.status<>'ACTIVE') THEN
    RAISE EXCEPTION 'zone state/version conflict' USING ERRCODE='23514'; END IF;
   IF NEW.action='UPDATE' AND NEW.profile IS NOT DISTINCT FROM zone.profile THEN RAISE EXCEPTION 'zone update has no changes' USING ERRCODE='23514'; END IF;
   IF NEW.action IN ('ARCHIVE','RESTORE') THEN NEW.profile:=zone.profile; END IF;
   NEW."resultVersion":=zone.version+1; NEW."resultStatus":=CASE WHEN NEW.action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END;
  END IF;
  NEW."resultZoneId":=NEW."zoneId";
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER delivery_zone_command_validation BEFORE INSERT ON "DeliveryZoneCommand" FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_zone_command();
CREATE FUNCTION public.protect_delivery_zone() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command public."DeliveryZoneCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'zones are archived, never deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO command FROM public."DeliveryZoneCommand" WHERE id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."DeliveryZoneCommand" WHERE id=NEW."lastCommandId";
 IF command.id IS NULL OR command.status<>'SUCCEEDED' OR command."organizationId"<>NEW."organizationId" OR command."locationId"<>NEW."locationId"
  OR command."zoneId"<>NEW.id OR command_xmin::text<>pg_current_xact_id()::text
  OR NEW.profile IS DISTINCT FROM command.profile OR NEW.status IS DISTINCT FROM command."resultStatus"
  OR NEW.version IS DISTINCT FROM command."resultVersion" OR NEW."updatedAt" IS DISTINCT FROM command."createdAt"
  OR NEW."updatedByUserId" IS DISTINCT FROM command."actorUserId" THEN
  RAISE EXCEPTION 'zone mutation requires its current transaction command' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF command.action<>'CREATE' OR NEW."createdAt" IS DISTINCT FROM command."createdAt" OR NEW."createdByUserId" IS DISTINCT FROM command."actorUserId" THEN
   RAISE EXCEPTION 'invalid zone creation provenance' USING ERRCODE='23514'; END IF;
 ELSE
  IF command.action='CREATE' OR command."expectedVersion" IS DISTINCT FROM OLD.version
   OR (to_jsonb(NEW)-ARRAY['profile','status','version','updatedByUserId','updatedAt','lastCommandId']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['profile','status','version','updatedByUserId','updatedAt','lastCommandId']) THEN
   RAISE EXCEPTION 'invalid zone update provenance' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_zone_protection BEFORE INSERT OR UPDATE OR DELETE ON "DeliveryZone" FOR EACH ROW EXECUTE FUNCTION public.protect_delivery_zone();
CREATE FUNCTION public.apply_delivery_zone_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status<>'SUCCEEDED' THEN RETURN NEW; END IF;
 IF NEW.action='CREATE' THEN
  INSERT INTO public."DeliveryZone"(id,"organizationId","locationId",profile,status,version,"createdByUserId","updatedByUserId","createdAt","updatedAt","lastCommandId")
   VALUES(NEW."zoneId",NEW."organizationId",NEW."locationId",NEW.profile,NEW."resultStatus",NEW."resultVersion",NEW."actorUserId",NEW."actorUserId",NEW."createdAt",NEW."createdAt",NEW.id);
 ELSE
  UPDATE public."DeliveryZone" SET profile=NEW.profile,status=NEW."resultStatus",version=NEW."resultVersion",
   "updatedByUserId"=NEW."actorUserId","updatedAt"=NEW."createdAt","lastCommandId"=NEW.id
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."zoneId";
  IF NOT FOUND THEN RAISE EXCEPTION 'zone disappeared' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_zone_command_application AFTER INSERT ON "DeliveryZoneCommand" FOR EACH ROW EXECUTE FUNCTION public.apply_delivery_zone_command();
REVOKE ALL ON FUNCTION public.delivery_coordinate_valid(jsonb),public.delivery_cross(jsonb,jsonb,jsonb),public.delivery_on_segment(jsonb,jsonb,jsonb),public.delivery_polygon_valid(jsonb),public.delivery_zone_profile_valid(jsonb),public.delivery_zone_actor_allowed(uuid,uuid,uuid),public.validate_delivery_zone_command(),public.protect_delivery_zone(),public.apply_delivery_zone_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_coordinate_valid(jsonb),public.delivery_cross(jsonb,jsonb,jsonb),public.delivery_on_segment(jsonb,jsonb,jsonb),public.delivery_polygon_valid(jsonb),public.delivery_zone_profile_valid(jsonb),public.delivery_zone_actor_allowed(uuid,uuid,uuid) TO pos_runtime;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
 ('delivery.zones.read','Vizualizarea zonelor de livrare',ARRAY['LOCATION'],true),
 ('delivery.zones.manage','Administrarea zonelor de livrare',ARRAY['LOCATION'],true);
COMMIT;
