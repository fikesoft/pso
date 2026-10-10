BEGIN;
LOCK TABLE "KitchenTicket","KitchenTicketItem" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "KitchenTicket" ADD COLUMN "generationTransaction" bigint NOT NULL DEFAULT txid_current();
ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT kitchen_item_batch_identity UNIQUE ("organizationId","locationId","ticketId",id);
CREATE TABLE "KitchenTicketBatch" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "ticketId" uuid NOT NULL,
 "stationId" uuid, "stationCode" text, "stationName" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","locationId","ticketId",id),
 UNIQUE ("organizationId","locationId","ticketId","stationId"),
 CHECK (("stationId" IS NULL AND "stationCode" IS NULL AND "stationName" IS NULL)
  OR ("stationId" IS NOT NULL AND "stationCode" IS NOT NULL AND "stationName" IS NOT NULL)),
 FOREIGN KEY ("organizationId","locationId","ticketId") REFERENCES "KitchenTicket"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","stationId") REFERENCES "KitchenStation"("organizationId","locationId",id)
);
CREATE UNIQUE INDEX kitchen_unassigned_batch_unique ON "KitchenTicketBatch"("organizationId","locationId","ticketId") WHERE "stationId" IS NULL;
CREATE TABLE "KitchenTicketBatchItem" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "ticketId" uuid NOT NULL,
 "batchId" uuid NOT NULL, "ticketItemId" uuid NOT NULL,
 PRIMARY KEY ("organizationId","locationId","ticketItemId"),
 FOREIGN KEY ("organizationId","locationId","ticketId","batchId") REFERENCES "KitchenTicketBatch"("organizationId","locationId","ticketId",id),
 FOREIGN KEY ("organizationId","locationId","ticketId","ticketItemId") REFERENCES "KitchenTicketItem"("organizationId","locationId","ticketId",id)
);
-- Existing tickets have no station provenance. Preserve that fact explicitly.
INSERT INTO "KitchenTicketBatch"(id,"organizationId","locationId","ticketId","createdAt")
 SELECT id,"organizationId","locationId",id,"createdAt" FROM "KitchenTicket";
INSERT INTO "KitchenTicketBatchItem"("organizationId","locationId","ticketId","batchId","ticketItemId")
 SELECT "organizationId","locationId","ticketId","ticketId",id FROM "KitchenTicketItem";
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicketBatch','KitchenTicketBatchItem'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',rel);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',rel);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',rel);
  EXECUTE format('CREATE TRIGGER kitchen_batch_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',rel);
 END LOOP;
END $$;
CREATE FUNCTION public.validate_kitchen_batch_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE generation_transaction bigint;
BEGIN
 SELECT "generationTransaction" INTO generation_transaction FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 IF generation_transaction IS DISTINCT FROM txid_current() THEN
  RAISE EXCEPTION 'kitchen batches belong to their atomic ticket generation' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='KitchenTicketBatch' THEN
  IF NEW."stationId" IS NOT NULL OR NEW.id<>NEW."ticketId" THEN
   RAISE EXCEPTION 'unrouted ticket requires its unassigned batch' USING ERRCODE='23514'; END IF;
  SELECT "createdAt" INTO NEW."createdAt" FROM public."KitchenTicket" WHERE id=NEW."ticketId";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_batch_validation BEFORE INSERT ON "KitchenTicketBatch" FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_batch_child();
CREATE TRIGGER kitchen_batch_item_validation BEFORE INSERT ON "KitchenTicketBatchItem" FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_batch_child();
CREATE FUNCTION public.seal_kitchen_generation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW."generationTransaction":=txid_current(); RETURN NEW;
END $$;
CREATE TRIGGER kitchen_generation_seal BEFORE INSERT ON "KitchenTicket" FOR EACH ROW EXECUTE FUNCTION public.seal_kitchen_generation();
CREATE FUNCTION public.generate_kitchen_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public."KitchenTicketBatch"(id,"organizationId","locationId","ticketId")
  VALUES(NEW.id,NEW."organizationId",NEW."locationId",NEW.id);
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_batch_generation AFTER INSERT ON "KitchenTicket" FOR EACH ROW EXECUTE FUNCTION public.generate_kitchen_batch();
CREATE FUNCTION public.assign_kitchen_batch_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public."KitchenTicketBatchItem"("organizationId","locationId","ticketId","batchId","ticketItemId")
  VALUES(NEW."organizationId",NEW."locationId",NEW."ticketId",NEW."ticketId",NEW.id);
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_batch_item_generation AFTER INSERT ON "KitchenTicketItem" FOR EACH ROW EXECUTE FUNCTION public.assign_kitchen_batch_item();
CREATE FUNCTION public.check_kitchen_batches() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public."KitchenTicketItem" i WHERE i."organizationId"=NEW."organizationId" AND i."ticketId"=NEW.id
  AND NOT EXISTS (SELECT 1 FROM public."KitchenTicketBatchItem" b WHERE b."organizationId"=i."organizationId"
   AND b."locationId"=i."locationId" AND b."ticketId"=i."ticketId" AND b."ticketItemId"=i.id))
 OR NOT EXISTS (SELECT 1 FROM public."KitchenTicketBatch" b WHERE b."organizationId"=NEW."organizationId" AND b."ticketId"=NEW.id)
 OR EXISTS (SELECT 1 FROM public."KitchenTicketBatch" b WHERE b."organizationId"=NEW."organizationId" AND b."ticketId"=NEW.id
  AND NOT EXISTS (SELECT 1 FROM public."KitchenTicketBatchItem" i WHERE i."organizationId"=b."organizationId" AND i."batchId"=b.id)) THEN
  RAISE EXCEPTION 'kitchen batches require every item exactly once and no empty batch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER kitchen_batch_consistency AFTER INSERT ON "KitchenTicket" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_batches();
REVOKE ALL ON FUNCTION public.seal_kitchen_generation(),public.validate_kitchen_batch_child(),public.generate_kitchen_batch(),public.assign_kitchen_batch_item(),public.check_kitchen_batches() FROM PUBLIC;
COMMIT;
