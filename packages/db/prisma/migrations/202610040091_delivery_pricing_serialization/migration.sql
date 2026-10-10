BEGIN;
-- A write, rather than an advisory lock alone, invalidates a stale RR snapshot.
-- One row covers the entire local selection set, including newly inserted zones.
CREATE TABLE "DeliveryPricingGuard" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 PRIMARY KEY("organizationId","locationId"),
 FOREIGN KEY("organizationId","locationId") REFERENCES "Location"("organizationId",id)
);
INSERT INTO "DeliveryPricingGuard"("organizationId","locationId") SELECT "organizationId",id FROM "Location";
ALTER TABLE "DeliveryPricingGuard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryPricingGuard" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "DeliveryPricingGuard" TO pos_runtime
 USING("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "DeliveryPricingGuard" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE ON "DeliveryPricingGuard" TO pos_runtime;
CREATE FUNCTION public.serialize_delivery_pricing() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='Order' THEN
  IF OLD.status<>'DRAFT' OR NEW.status IN ('DRAFT','CANCELLED') OR NEW."serviceType"<>'DELIVERY' THEN RETURN NEW; END IF;
 ELSIF NEW.status<>'SUCCEEDED' THEN RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 INSERT INTO public."DeliveryPricingGuard"("organizationId","locationId",revision)
 VALUES(NEW."organizationId",NEW."locationId",1)
 ON CONFLICT("organizationId","locationId") DO UPDATE SET revision=public."DeliveryPricingGuard".revision+1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.serialize_delivery_pricing() FROM PUBLIC;
-- Alphabetical ordering runs this before each pricing validation trigger.
CREATE TRIGGER aaa_delivery_pricing_serialization BEFORE INSERT ON "DeliveryZoneCommand"
 FOR EACH ROW EXECUTE FUNCTION public.serialize_delivery_pricing();
CREATE TRIGGER aaa_delivery_pricing_serialization BEFORE INSERT ON "OrderDeliveryFeeCommand"
 FOR EACH ROW EXECUTE FUNCTION public.serialize_delivery_pricing();
CREATE TRIGGER aaa_delivery_pricing_serialization BEFORE UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.serialize_delivery_pricing();
COMMIT;
