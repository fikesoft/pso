-- Terminal request identities, never mutable pending state or browser draft content.
BEGIN;
-- Exclude writes between the truthful identity backfill and trigger installation.
LOCK TABLE "Order" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "OrderCreationClaim" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, status text NOT NULL CHECK (status IN ('CREATED','RETIRED')),
 "orderId" uuid, "requestHash" text, "actorUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((status='CREATED' AND "orderId" IS NOT NULL AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[a-f0-9]{64}$')
  OR (status='RETIRED' AND "orderId" IS NULL AND "requestHash" IS NULL)),
 UNIQUE ("organizationId","locationId","requestKey"), UNIQUE ("organizationId","orderId"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id)
);
CREATE POLICY order_creation_upgrade_read ON "Order" FOR SELECT TO pos_migrator USING (true);
INSERT INTO "OrderCreationClaim" (id,"organizationId","locationId","requestKey",status,"orderId","requestHash","actorUserId","createdAt")
 SELECT gen_random_uuid(),"organizationId","locationId","clientRequestId",'CREATED',id,"creationRequestHash","createdByUserId","createdAt"
 FROM "Order";
DROP POLICY order_creation_upgrade_read ON "Order";

ALTER TABLE "OrderCreationClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderCreationClaim" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "OrderCreationClaim" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "OrderCreationClaim" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "OrderCreationClaim" TO pos_runtime;
CREATE TRIGGER order_creation_claim_immutable BEFORE UPDATE OR DELETE ON "OrderCreationClaim"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.validate_order_creation_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='RETIRED' THEN
  IF NEW."actorUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
   OR NOT EXISTS (SELECT 1 FROM public."CompanyUser" u
    WHERE u."organizationId"=NEW."organizationId" AND u.id=NEW."actorUserId" AND u.status='ACTIVE'
     AND (u."isPrimaryAdmin" OR EXISTS (SELECT 1 FROM public."UserLocationAccess" a
      WHERE a."organizationId"=NEW."organizationId" AND a."locationId"=NEW."locationId" AND a."userId"=u.id)))
   OR EXISTS (SELECT 1 FROM public."Order" o WHERE o."organizationId"=NEW."organizationId"
    AND o."locationId"=NEW."locationId" AND o."clientRequestId"=NEW."requestKey") THEN
   RAISE EXCEPTION 'retirement requires the scoped actor and an uncreated order key' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER order_creation_claim_validation BEFORE INSERT ON "OrderCreationClaim"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_creation_claim();

CREATE FUNCTION public.claim_created_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Both creation and retirement INSERT into this same UNIQUE key. A stale RR
 -- snapshot cannot bypass the conflict, unlike advisory-lock-and-SELECT alone.
 INSERT INTO public."OrderCreationClaim" (id,"organizationId","locationId","requestKey",status,"orderId","requestHash","actorUserId")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."clientRequestId",'CREATED',NEW.id,NEW."creationRequestHash",NEW."createdByUserId");
 RETURN NULL;
END $$;
CREATE TRIGGER order_creation_claim AFTER INSERT ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.claim_created_order();

CREATE FUNCTION public.check_created_order_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; order_xmin xid;
BEGIN
 IF NEW.status='CREATED' THEN
  SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND id=NEW."orderId";
  SELECT xmin INTO order_xmin FROM public."Order" WHERE id=o.id;
  IF o.id IS NULL OR order_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR (o."locationId",o."clientRequestId",o."creationRequestHash",o."createdByUserId")
    IS DISTINCT FROM (NEW."locationId",NEW."requestKey",NEW."requestHash",NEW."actorUserId") THEN
   RAISE EXCEPTION 'created claim requires its exact atomic order identity' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER created_order_claim_consistency AFTER INSERT ON "OrderCreationClaim"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_created_order_claim();
REVOKE ALL ON FUNCTION public.validate_order_creation_claim(),public.claim_created_order(),public.check_created_order_claim() FROM PUBLIC;
COMMIT;
