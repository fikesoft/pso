BEGIN;
ALTER TABLE "DeliveryOperation" ADD CONSTRAINT delivery_operation_scoped_id
 UNIQUE ("organizationId","locationId","orderId",id);
CREATE TABLE "CourierAcceptanceCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL, "assignmentId" uuid NOT NULL, "courierId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "requestHash" text CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "expectedOrderVersion" integer CHECK ("expectedOrderVersion">0),
 "acceptedAt" timestamptz(3), "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","requestKey"),
 CHECK ((status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "expectedOrderVersion" IS NOT NULL AND "acceptedAt" IS NOT NULL)
   OR (status='RETIRED' AND "requestHash" IS NULL AND "expectedOrderVersion" IS NULL AND "acceptedAt" IS NULL)),
 FOREIGN KEY ("organizationId","locationId","orderId","assignmentId") REFERENCES "DeliveryOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","courierId") REFERENCES "Courier"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE UNIQUE INDEX courier_acceptance_once ON "CourierAcceptanceCommand"("organizationId","assignmentId") WHERE status='SUCCEEDED';
CREATE INDEX courier_acceptance_order ON "CourierAcceptanceCommand"("organizationId","locationId","orderId");
ALTER TABLE "CourierAcceptanceCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourierAcceptanceCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CourierAcceptanceCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "CourierAcceptanceCommand" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "CourierAcceptanceCommand" TO pos_runtime;
CREATE FUNCTION public.validate_courier_acceptance() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; profile public."Courier"; assignment public."DeliveryOperation";
BEGIN
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'courier acceptance requires its active scoped actor' USING ERRCODE='23514';
 END IF;
 PERFORM public.lock_courier_activity(NEW."organizationId",NEW."locationId",NEW."actorUserId");
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
 SELECT * INTO profile FROM public."Courier" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."courierId";
 SELECT * INTO assignment FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."assignmentId";
 IF o.id IS NULL OR o."serviceType"<>'DELIVERY' OR o."deliveryCourierId" IS DISTINCT FROM NEW."actorUserId"
  OR profile.id IS NULL OR profile."userId"<>NEW."actorUserId"
  OR assignment.id IS NULL OR assignment."toStatus"<>'ASSIGNED' OR assignment."courierUserId"<>NEW."actorUserId" THEN
  RAISE EXCEPTION 'courier acceptance must belong to the assigned courier, order and location' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 IF NEW.status='RETIRED' THEN
  NEW."requestHash":=NULL; NEW."expectedOrderVersion":=NULL; NEW."acceptedAt":=NULL;
  RETURN NEW;
 END IF;
 IF profile.status<>'ACTIVE' OR o."deliveryStatus"<>'ASSIGNED' OR public.effective_order_status(o.status,o."kitchenStatus") IN ('DRAFT','CANCELLED')
  OR NEW."expectedOrderVersion" IS DISTINCT FROM o.version
  OR assignment.id IS DISTINCT FROM (SELECT id FROM public."DeliveryOperation"
   WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId" AND "toStatus"='ASSIGNED' ORDER BY "orderVersion" DESC LIMIT 1)
  OR EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId" AND mode='DEMO') THEN
  RAISE EXCEPTION 'courier accepts the current assignment and current order version exactly once' USING ERRCODE='23514';
 END IF;
 NEW."acceptedAt":=NEW."createdAt";
 RETURN NEW;
END $$;
CREATE TRIGGER courier_acceptance_create BEFORE INSERT ON "CourierAcceptanceCommand" FOR EACH ROW EXECUTE FUNCTION public.validate_courier_acceptance();
CREATE TRIGGER courier_acceptance_immutable BEFORE UPDATE OR DELETE ON "CourierAcceptanceCommand" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.require_courier_acceptance_for_pickup() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; assignment_id uuid;
BEGIN
 IF NEW."toStatus"<>'PICKED_UP' THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 IF NOT EXISTS (SELECT 1 FROM public."Courier" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "userId"=o."deliveryCourierId") THEN RETURN NEW; END IF;
 SELECT id INTO assignment_id FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId" AND "toStatus"='ASSIGNED' ORDER BY "orderVersion" DESC LIMIT 1;
 IF NOT EXISTS (SELECT 1 FROM public."CourierAcceptanceCommand" WHERE "organizationId"=NEW."organizationId" AND "assignmentId"=assignment_id AND status='SUCCEEDED') THEN
  RAISE EXCEPTION 'registered courier must accept this assignment before pickup' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aab_courier_acceptance_pickup BEFORE INSERT ON "DeliveryOperation" FOR EACH ROW EXECUTE FUNCTION public.require_courier_acceptance_for_pickup();
REVOKE ALL ON FUNCTION public.validate_courier_acceptance(),public.require_courier_acceptance_for_pickup() FROM PUBLIC;
COMMIT;
