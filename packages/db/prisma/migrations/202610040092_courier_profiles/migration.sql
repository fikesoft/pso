BEGIN;
CREATE FUNCTION public.courier_profile_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN jsonb_typeof(p)='object' AND p ?& ARRAY['vehicle','capacity']
  AND p-ARRAY['vehicle','capacity']='{}'::jsonb
  AND p->>'vehicle' IN ('WALK','BICYCLE','SCOOTER','CAR')
  AND jsonb_typeof(p->'capacity')='number' AND p->>'capacity'~'^[0-9]+$'
  AND (p->>'capacity')::int BETWEEN 1 AND 20;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE TABLE "Courier" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "userId" uuid NOT NULL,
 profile jsonb NOT NULL CHECK(public.courier_profile_valid(profile) IS TRUE),
 status text NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED')),
 availability text NOT NULL CHECK(availability IN ('OFFLINE','AVAILABLE','PAUSED')),
 version integer NOT NULL CHECK(version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL, "updatedAt" timestamptz(3) NOT NULL, "lastCommandId" uuid NOT NULL,
 CHECK(status<>'ARCHIVED' OR availability='OFFLINE'),
 UNIQUE("organizationId",id), UNIQUE("organizationId","locationId",id), UNIQUE("organizationId","locationId","userId"),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE INDEX courier_location_page ON "Courier"("organizationId","locationId",status,id);
CREATE TABLE "CourierCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "courierId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('CREATE','UPDATE','SET_AVAILABILITY','ARCHIVE','RESTORE')),
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer, "resultStatus" text, "userId" uuid,
 availability text, profile jsonb, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","locationId","courierId",id),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL AND "resultVersion" IS NULL
  AND "resultStatus" IS NULL AND "userId" IS NULL AND availability IS NULL AND profile IS NULL)
 OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash"~'^[0-9a-f]{64}$'
  AND "resultVersion" IS NOT NULL AND "resultVersion">0 AND "resultStatus" IS NOT NULL AND "resultStatus" IN ('ACTIVE','ARCHIVED')
  AND "userId" IS NOT NULL AND availability IS NOT NULL AND availability IN ('OFFLINE','AVAILABLE','PAUSED')
  AND profile IS NOT NULL AND public.courier_profile_valid(profile) IS TRUE
  AND ("resultStatus"<>'ARCHIVED' OR availability='OFFLINE')
  AND ((action='CREATE' AND "expectedVersion" IS NULL AND "resultVersion"=1)
    OR (action<>'CREATE' AND "expectedVersion" IS NOT NULL AND "expectedVersion">0 AND "resultVersion"::bigint="expectedVersion"::bigint+1))))
);
CREATE UNIQUE INDEX courier_command_version ON "CourierCommand"("organizationId","courierId","resultVersion") WHERE status='SUCCEEDED';
ALTER TABLE "Courier" ADD FOREIGN KEY("organizationId","locationId",id,"lastCommandId")
 REFERENCES "CourierCommand"("organizationId","locationId","courierId",id);
CREATE TABLE "CourierActivityGuard" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "userId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), PRIMARY KEY("organizationId","locationId","userId"),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY("organizationId","userId") REFERENCES "CompanyUser"("organizationId",id)
);
ALTER TABLE "Courier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Courier" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CourierCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourierCommand" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CourierActivityGuard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourierActivityGuard" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "Courier" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "CourierCommand" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "CourierActivityGuard" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "Courier","CourierCommand","CourierActivityGuard" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "Courier","CourierCommand" TO pos_runtime;
GRANT UPDATE(profile,status,availability,version,"updatedByUserId","updatedAt","lastCommandId") ON "Courier" TO pos_runtime;
GRANT SELECT,INSERT ON "CourierActivityGuard" TO pos_runtime;
GRANT UPDATE(revision) ON "CourierActivityGuard" TO pos_runtime;
REVOKE UPDATE ON "DeliveryPricingGuard" FROM pos_runtime;
GRANT UPDATE(revision) ON "DeliveryPricingGuard" TO pos_runtime;
CREATE TRIGGER courier_command_immutable BEFORE UPDATE OR DELETE ON "CourierCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.lock_courier_activity(org uuid,loc uuid,user_ uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF user_ IS NULL THEN RETURN; END IF;
 INSERT INTO public."CourierActivityGuard"("organizationId","locationId","userId",revision) VALUES(org,loc,user_,1)
 ON CONFLICT("organizationId","locationId","userId") DO UPDATE SET revision=public."CourierActivityGuard".revision+1;
END $$;
CREATE FUNCTION public.courier_active_deliveries(org uuid,loc uuid,user_ uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public."Order" WHERE "organizationId"=org AND "locationId"=loc
  AND "deliveryCourierId"=user_ AND "deliveryStatus" IN ('ASSIGNED','PICKED_UP','DELIVERING')
$$;
CREATE FUNCTION public.validate_courier_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_ public."Courier"; subject_ public."CompanyUser"; count_ bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'courier command requires active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO current_ FROM public."Courier" WHERE "organizationId"=NEW."organizationId" AND id=NEW."courierId" FOR UPDATE;
 IF current_.id IS NOT NULL AND current_."locationId"<>NEW."locationId" THEN
  RAISE EXCEPTION 'courier location mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.action<>'CREATE' AND current_.id IS NULL THEN RAISE EXCEPTION 'courier missing' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=CURRENT_TIMESTAMP;
 IF NEW.status='RETIRED' THEN RETURN NEW; END IF;
 IF NEW.action='CREATE' THEN
  IF current_.id IS NOT NULL THEN RAISE EXCEPTION 'courier already exists' USING ERRCODE='23514'; END IF;
  NEW."resultVersion":=1; NEW."resultStatus":='ACTIVE'; NEW.availability:='OFFLINE';
 ELSE
  IF current_.version=2147483647 OR NEW."expectedVersion" IS DISTINCT FROM current_.version
   OR current_.status<>(CASE WHEN NEW.action='RESTORE' THEN 'ARCHIVED' ELSE 'ACTIVE' END)
   OR (NEW."userId" IS NOT NULL AND NEW."userId"<>current_."userId") THEN
   RAISE EXCEPTION 'courier version status or identity mismatch' USING ERRCODE='23514'; END IF;
  NEW."userId":=current_."userId"; NEW."resultVersion":=current_.version+1;
  NEW."resultStatus":=CASE WHEN NEW.action='ARCHIVE' THEN 'ARCHIVED' ELSE 'ACTIVE' END;
  IF NEW.action<>'UPDATE' THEN NEW.profile:=current_.profile;
  ELSIF NEW.profile IS NOT DISTINCT FROM current_.profile THEN RAISE EXCEPTION 'courier profile unchanged' USING ERRCODE='23514'; END IF;
  IF NEW.action IN ('ARCHIVE','RESTORE') THEN NEW.availability:='OFFLINE';
  ELSIF NEW.action<>'SET_AVAILABILITY' THEN NEW.availability:=current_.availability;
  ELSIF NEW.availability IS NOT DISTINCT FROM current_.availability THEN RAISE EXCEPTION 'courier availability unchanged' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM public.lock_courier_activity(NEW."organizationId",NEW."locationId",NEW."userId");
 SELECT public.courier_active_deliveries(NEW."organizationId",NEW."locationId",NEW."userId") INTO count_;
 IF count_>0 AND (NEW.availability='OFFLINE' OR NEW."resultStatus"='ARCHIVED')
  OR count_>(NEW.profile->>'capacity')::int THEN
  RAISE EXCEPTION 'courier activity prevents offline archive or capacity reduction' USING ERRCODE='23514'; END IF;
 IF NEW.action IN ('CREATE','RESTORE') OR NEW.availability='AVAILABLE' THEN
  SELECT * INTO subject_ FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."userId";
  IF subject_.id IS NULL OR subject_.status<>'ACTIVE' OR (NOT subject_."isPrimaryAdmin" AND NOT EXISTS(
   SELECT 1 FROM public."UserLocationAccess" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "userId"=NEW."userId")) THEN
   RAISE EXCEPTION 'courier requires active identity in location' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER courier_command_validation BEFORE INSERT ON "CourierCommand" FOR EACH ROW EXECUTE FUNCTION public.validate_courier_command();
CREATE FUNCTION public.protect_courier() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public."CourierCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'courier profiles cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public."CourierCommand" WHERE id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."CourierCommand" WHERE id=NEW."lastCommandId";
 IF c.id IS NULL OR c.status<>'SUCCEEDED' OR command_xmin::text<>pg_current_xact_id()::text
  OR (NEW."organizationId",NEW."locationId",NEW.id,NEW."userId",NEW.profile,NEW.status,NEW.availability,NEW.version,NEW."updatedByUserId",NEW."updatedAt")
   IS DISTINCT FROM (c."organizationId",c."locationId",c."courierId",c."userId",c.profile,c."resultStatus",c.availability,c."resultVersion",c."actorUserId",c."createdAt") THEN
  RAISE EXCEPTION 'courier mutation requires current transaction command' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF c.action<>'CREATE' OR NEW."createdByUserId"<>c."actorUserId" OR NEW."createdAt"<>c."createdAt" THEN
   RAISE EXCEPTION 'courier creation provenance mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF c.action='CREATE' OR c."expectedVersion" IS DISTINCT FROM OLD.version
   OR (NEW.id,NEW."organizationId",NEW."locationId",NEW."userId",NEW."createdByUserId",NEW."createdAt") IS DISTINCT FROM
      (OLD.id,OLD."organizationId",OLD."locationId",OLD."userId",OLD."createdByUserId",OLD."createdAt") THEN
   RAISE EXCEPTION 'courier identity and creation history immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER courier_protection BEFORE INSERT OR UPDATE OR DELETE ON "Courier" FOR EACH ROW EXECUTE FUNCTION public.protect_courier();
CREATE FUNCTION public.apply_courier_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  IF NEW.action='CREATE' THEN
   INSERT INTO public."Courier"(id,"organizationId","locationId","userId",profile,status,availability,version,"createdByUserId","updatedByUserId","createdAt","updatedAt","lastCommandId")
   VALUES(NEW."courierId",NEW."organizationId",NEW."locationId",NEW."userId",NEW.profile,NEW."resultStatus",NEW.availability,NEW."resultVersion",NEW."actorUserId",NEW."actorUserId",NEW."createdAt",NEW."createdAt",NEW.id);
  ELSE
   UPDATE public."Courier" SET profile=NEW.profile,status=NEW."resultStatus",availability=NEW.availability,version=NEW."resultVersion",
    "updatedByUserId"=NEW."actorUserId","updatedAt"=NEW."createdAt","lastCommandId"=NEW.id
    WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."courierId";
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER courier_command_application AFTER INSERT ON "CourierCommand" FOR EACH ROW EXECUTE FUNCTION public.apply_courier_command();
CREATE FUNCTION public.guard_delivery_courier_profile() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; c public."Courier"; target_ uuid; user_ uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 target_:=CASE WHEN NEW."toStatus"='ASSIGNED' THEN NEW."courierUserId" ELSE o."deliveryCourierId" END;
 FOR user_ IN SELECT DISTINCT v FROM unnest(ARRAY[o."deliveryCourierId",target_]) v WHERE v IS NOT NULL ORDER BY v LOOP
  PERFORM public.lock_courier_activity(NEW."organizationId",NEW."locationId",user_);
 END LOOP;
 IF NEW."toStatus"='ASSIGNED' THEN
  SELECT * INTO c FROM public."Courier" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "userId"=target_;
  -- Legacy assignments without a profile remain readable/operable during rollout.
  -- A registered profile is always authoritative; no fallback around offline/archive/capacity.
  IF c.id IS NOT NULL AND (c.status<>'ACTIVE' OR c.availability<>'AVAILABLE'
   OR public.courier_active_deliveries(NEW."organizationId",NEW."locationId",target_)>=(c.profile->>'capacity')::int) THEN
   RAISE EXCEPTION 'courier unavailable or at capacity' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_courier_profile_guard BEFORE INSERT ON "DeliveryOperation" FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_courier_profile();
REVOKE ALL ON FUNCTION public.courier_profile_valid(jsonb),public.lock_courier_activity(uuid,uuid,uuid),public.courier_active_deliveries(uuid,uuid,uuid),public.validate_courier_command(),public.protect_courier(),public.apply_courier_command(),public.guard_delivery_courier_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_profile_valid(jsonb),public.lock_courier_activity(uuid,uuid,uuid),public.courier_active_deliveries(uuid,uuid,uuid) TO pos_runtime;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
 ('couriers.read','Vizualizarea curierilor, stării și încărcării',ARRAY['LOCATION'],true),
 ('couriers.manage','Administrarea profilurilor curierilor',ARRAY['LOCATION'],true),
 ('couriers.availability','Schimbarea disponibilității proprii de curier',ARRAY['LOCATION'],true);
COMMIT;
