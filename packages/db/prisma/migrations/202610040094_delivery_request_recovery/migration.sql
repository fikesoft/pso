BEGIN;
CREATE TABLE "DeliveryRequestGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY("organizationId","locationId","requestKey"),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id)
);
CREATE TABLE "DeliveryRequestRetirement" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 "toStatus" text NOT NULL CHECK("toStatus" IN ('WAITING_COURIER','ASSIGNED','PICKED_UP','DELIVERING','DELIVERED','FAILED')),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId",id), UNIQUE("organizationId","locationId","requestKey"),
 FOREIGN KEY("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","locationId","requestKey") REFERENCES "DeliveryRequestGate"("organizationId","locationId","requestKey")
);
ALTER TABLE "DeliveryRequestGate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryRequestGate" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryRequestRetirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryRequestRetirement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DeliveryRequestGate" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "DeliveryRequestRetirement" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DeliveryRequestGate","DeliveryRequestRetirement" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "DeliveryRequestGate","DeliveryRequestRetirement" TO pos_runtime;
GRANT UPDATE(revision) ON "DeliveryRequestGate" TO pos_runtime;
CREATE FUNCTION public.lock_delivery_request(org uuid,loc uuid,key_ uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(org::text,0));
 INSERT INTO public."DeliveryRequestGate"("organizationId","locationId","requestKey",revision) VALUES(org,loc,key_,1)
 ON CONFLICT("organizationId","locationId","requestKey") DO UPDATE SET revision=public."DeliveryRequestGate".revision+1;
END $$;
CREATE FUNCTION public.guard_delivery_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.lock_delivery_request(NEW."organizationId",NEW."locationId",NEW."requestKey");
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'delivery request requires its active scoped actor' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public."DeliveryRequestRetirement" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey") THEN
  RAISE EXCEPTION 'delivery request was permanently retired' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.validate_delivery_retirement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.lock_delivery_request(NEW."organizationId",NEW."locationId",NEW."requestKey");
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'delivery retirement requires its active scoped actor' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId" AND "serviceType"='DELIVERY')
  OR EXISTS(SELECT 1 FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey") THEN
  RAISE EXCEPTION 'only an unexecuted delivery request may be retired' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER aa_delivery_request_guard BEFORE INSERT ON "DeliveryOperation" FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_request();
CREATE TRIGGER delivery_retirement_create BEFORE INSERT ON "DeliveryRequestRetirement" FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_retirement();
CREATE TRIGGER delivery_retirement_immutable BEFORE UPDATE OR DELETE ON "DeliveryRequestRetirement" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
REVOKE ALL ON FUNCTION public.lock_delivery_request(uuid,uuid,uuid),public.guard_delivery_request(),public.validate_delivery_retirement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_delivery_request(uuid,uuid,uuid) TO pos_runtime;
COMMIT;
