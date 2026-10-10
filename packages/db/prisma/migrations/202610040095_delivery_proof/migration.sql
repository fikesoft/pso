BEGIN;
CREATE TABLE "DeliveryProof" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL, "operationId" uuid NOT NULL, "assignmentId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL, "privateDataEncrypted" text NOT NULL CHECK (length("privateDataEncrypted") BETWEEN 64 AND 400000),
 "confirmedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","operationId"),
 FOREIGN KEY ("organizationId","locationId","orderId","operationId") REFERENCES "DeliveryOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","assignmentId") REFERENCES "DeliveryOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE INDEX delivery_proof_order ON "DeliveryProof"("organizationId","locationId","orderId");
ALTER TABLE "DeliveryProof" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryProof" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DeliveryProof" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DeliveryProof" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "DeliveryProof" TO pos_runtime;
CREATE FUNCTION public.validate_delivery_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."DeliveryOperation"; assignment public."DeliveryOperation"; op_xmin xid;
BEGIN
 IF NOT public.delivery_zone_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'delivery proof requires its active scoped actor' USING ERRCODE='23514';
 END IF;
 SELECT * INTO op FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."operationId";
 SELECT xmin INTO op_xmin FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND id=NEW."operationId";
 SELECT * INTO assignment FROM public."DeliveryOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND "toStatus"='ASSIGNED' ORDER BY "orderVersion" DESC LIMIT 1;
 IF op.id IS NULL OR op."toStatus"<>'DELIVERED' OR op."actorUserId"<>NEW."actorUserId"
  OR op."courierUserId" IS DISTINCT FROM NEW."actorUserId" OR op_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR assignment.id IS DISTINCT FROM NEW."assignmentId" OR assignment."courierUserId" IS DISTINCT FROM NEW."actorUserId" THEN
  RAISE EXCEPTION 'delivery proof belongs to its courier and atomic delivery operation and current assignment' USING ERRCODE='23514';
 END IF;
 NEW."confirmedAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_proof_create BEFORE INSERT ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_proof();
CREATE TRIGGER delivery_proof_immutable BEFORE UPDATE OR DELETE ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.require_delivery_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."toStatus"='DELIVERED' AND EXISTS (
  SELECT 1 FROM public."Courier" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "userId"=NEW."courierUserId"
 ) AND NOT EXISTS (
  SELECT 1 FROM public."DeliveryProof" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND "operationId"=NEW.id
 ) THEN
  RAISE EXCEPTION 'registered courier delivery requires atomic proof' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER delivery_operation_proof AFTER INSERT ON "DeliveryOperation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_delivery_proof();
REVOKE ALL ON FUNCTION public.validate_delivery_proof(),public.require_delivery_proof() FROM PUBLIC;
COMMIT;
