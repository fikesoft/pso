BEGIN;
CREATE TABLE "BillSplitVoid" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
 "actorUserId" uuid NOT NULL, reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","splitId"), UNIQUE ("organizationId","locationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId","splitId") REFERENCES "BillSplit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
ALTER TABLE "BillSplitVoid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillSplitVoid" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "BillSplitVoid" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "BillSplitVoid" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "BillSplitVoid" TO pos_runtime;
CREATE TRIGGER bill_void_immutable BEFORE UPDATE OR DELETE ON "BillSplitVoid" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "BillSplitSource" ADD COLUMN "isActive" boolean NOT NULL DEFAULT true;
ALTER TABLE "BillSplitSource" DROP CONSTRAINT "BillSplitSource_organizationId_orderId_key";
CREATE UNIQUE INDEX bill_active_source ON "BillSplitSource"("organizationId","orderId") WHERE "isActive";
GRANT UPDATE("isActive") ON "BillSplitSource" TO pos_runtime;
DROP TRIGGER bill_immutable ON "BillSplitSource";
CREATE FUNCTION public.guard_bill_source_projection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE void_xmin xid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT NEW."isActive" THEN RAISE EXCEPTION 'new bill source must be active' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'bill source is immutable' USING ERRCODE='23514'; END IF;
 SELECT xmin INTO void_xmin FROM public."BillSplitVoid" WHERE "organizationId"=OLD."organizationId" AND "locationId"=OLD."locationId" AND "splitId"=OLD."splitId";
 IF NOT OLD."isActive" OR NEW."isActive" OR (to_jsonb(NEW)-'isActive') IS DISTINCT FROM (to_jsonb(OLD)-'isActive')
  OR void_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
  RAISE EXCEPTION 'bill source release requires its atomic void' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_source_projection BEFORE INSERT OR UPDATE OR DELETE ON "BillSplitSource" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_source_projection();
CREATE FUNCTION public.validate_bill_void() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'bill void requires current scoped actor' USING ERRCODE='23514'; END IF;
 FOR target IN SELECT "orderId" FROM public."BillSplitSource" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "splitId"=NEW."splitId" ORDER BY "orderId" LOOP
  PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",target);
 END LOOP;
 IF EXISTS (SELECT 1 FROM public."BillSplitSource" s JOIN public."Payment" p ON (p."organizationId",p."orderId")=(s."organizationId",s."orderId")
  WHERE s."organizationId"=NEW."organizationId" AND s."splitId"=NEW."splitId") THEN
  RAISE EXCEPTION 'bill void requires no previous collection' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER bill_void_validation BEFORE INSERT ON "BillSplitVoid" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_void();
CREATE FUNCTION public.release_bill_sources() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public."BillSplitSource" SET "isActive"=false WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "splitId"=NEW."splitId";
 RETURN NULL;
END $$;
CREATE TRIGGER bill_void_release AFTER INSERT ON "BillSplitVoid" FOR EACH ROW EXECUTE FUNCTION public.release_bill_sources();
CREATE OR REPLACE FUNCTION public.guard_bill_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE planned boolean; allocation numeric;
BEGIN
 PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",NEW."orderId");
 SELECT EXISTS (SELECT 1 FROM public."BillSplitSource" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId" AND "isActive") INTO planned;
 IF TG_TABLE_NAME='Checkout' THEN
  IF planned THEN RAISE EXCEPTION 'split bill requires collection by part' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind='COLLECT' THEN
  IF planned THEN
   SELECT a.amount INTO allocation FROM public."BillPartAllocation" a JOIN public."BillSplitSource" s
    ON (s."organizationId",s."locationId",s."splitId",s."orderId")=(a."organizationId",a."locationId",a."splitId",a."orderId")
    WHERE a."organizationId"=NEW."organizationId" AND a."locationId"=NEW."locationId" AND a."partId"=NEW."billPartId" AND a."orderId"=NEW."orderId" AND s."isActive";
   IF allocation IS NULL OR NEW.amount>allocation-public.bill_part_order_net(NEW."organizationId",NEW."billPartId",NEW."orderId") THEN
    RAISE EXCEPTION 'collection exceeds split part allocation or lacks its part (active required)' USING ERRCODE='23514'; END IF;
  ELSIF NEW."billPartId" IS NOT NULL THEN RAISE EXCEPTION 'order has no split part (active required)' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.guard_active_bill_collection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' AND EXISTS (SELECT 1 FROM public."BillPart" p JOIN public."BillSplitVoid" v
  ON (v."organizationId",v."locationId",v."splitId")=(p."organizationId",p."locationId",p."splitId")
  WHERE p."organizationId"=NEW."organizationId" AND p.id=NEW."partId") THEN
  RAISE EXCEPTION 'bill collection requires active split' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
-- Runs after the existing collection validator acquires every order gate.
CREATE TRIGGER bill_collection_void_guard BEFORE INSERT ON "BillCollection" FOR EACH ROW EXECUTE FUNCTION public.guard_active_bill_collection();
CREATE FUNCTION public.guard_bill_order_cancellation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' THEN
  PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",NEW.id);
  IF EXISTS (SELECT 1 FROM public."BillSplitSource" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id AND "isActive") THEN
   RAISE EXCEPTION 'void active bill split before cancelling its order' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_order_cancellation BEFORE UPDATE OF status ON "Order" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_order_cancellation();
REVOKE ALL ON FUNCTION public.guard_bill_source_projection(),public.validate_bill_void(),public.release_bill_sources(),public.guard_active_bill_collection(),public.guard_bill_order_cancellation() FROM PUBLIC;
COMMIT;
