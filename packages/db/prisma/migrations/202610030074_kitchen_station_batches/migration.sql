BEGIN;
LOCK TABLE "KitchenTicket","KitchenTicketItem","KitchenTicketBatch","KitchenTicketBatchItem" IN ACCESS EXCLUSIVE MODE;
-- The migration role is also non-BYPASSRLS. Temporary policies apply only to this
-- role, inside the locked migration transaction, and are removed before commit.
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicket','KitchenTicketItem','KitchenTicketBatch','KitchenTicketBatchItem'] LOOP
  EXECUTE format('CREATE POLICY migration_kitchen_backfill ON %I TO %I USING (true) WITH CHECK (true)',rel,current_user);
 END LOOP;
END $$;
DROP TRIGGER kitchen_batch_validation ON "KitchenTicketBatch";
DROP TRIGGER kitchen_batch_item_validation ON "KitchenTicketBatchItem";
-- Repair historical tickets not visible to the migration role during migration 072.
INSERT INTO "KitchenTicketBatch"(id,"organizationId","locationId","ticketId","createdAt")
 SELECT t.id,t."organizationId",t."locationId",t.id,t."createdAt" FROM "KitchenTicket" t
 WHERE NOT EXISTS(SELECT 1 FROM "KitchenTicketBatch" b WHERE b."ticketId"=t.id AND b."organizationId"=t."organizationId");
INSERT INTO "KitchenTicketBatchItem"("organizationId","locationId","ticketId","batchId","ticketItemId")
 SELECT i."organizationId",i."locationId",i."ticketId",i."ticketId",i.id FROM "KitchenTicketItem" i
 WHERE NOT EXISTS(SELECT 1 FROM "KitchenTicketBatchItem" b WHERE b."ticketItemId"=i.id AND b."organizationId"=i."organizationId");
ALTER TABLE "KitchenRoutingCommand" ADD UNIQUE ("organizationId","locationId",id);
ALTER TABLE "KitchenTicketBatchItem" ADD COLUMN "routingCommandId" uuid;
ALTER TABLE "KitchenTicketBatchItem" ADD FOREIGN KEY ("organizationId","locationId","routingCommandId")
 REFERENCES "KitchenRoutingCommand"("organizationId","locationId",id);
ALTER TABLE "KitchenTicketBatch" ADD COLUMN status text NOT NULL DEFAULT 'QUEUED'
 CHECK (status IN ('QUEUED','PREPARING','PARTIALLY_READY','READY','CANCELLED'));
ALTER TABLE "KitchenTicketBatch" ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE "KitchenTicketBatch" ADD COLUMN "updatedByUserId" uuid;
ALTER TABLE "KitchenTicketBatch" ADD COLUMN "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "KitchenTicketBatch" ADD FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id);
DROP TRIGGER kitchen_batch_immutable ON "KitchenTicketBatch";
UPDATE "KitchenTicketBatch" b SET status=public.effective_kitchen_status(t.status),
 "updatedByUserId"=coalesce(t."updatedByUserId",t."sentByUserId"), "updatedAt"=t."updatedAt"
 FROM "KitchenTicket" t WHERE t.id=b."ticketId" AND t."organizationId"=b."organizationId";
ALTER TABLE "KitchenTicketBatch" ALTER COLUMN "updatedByUserId" SET NOT NULL;
GRANT UPDATE(status,version,"updatedByUserId","updatedAt") ON "KitchenTicketBatch" TO pos_runtime;
DROP TRIGGER kitchen_batch_generation ON "KitchenTicket";

CREATE OR REPLACE FUNCTION public.validate_kitchen_batch_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; station public."KitchenStation"; item_product uuid;
 route public."KitchenRoutingCommand"; batch_station uuid;
BEGIN
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 IF ticket."generationTransaction" IS DISTINCT FROM txid_current() THEN
  RAISE EXCEPTION 'kitchen batches belong to their atomic ticket generation' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='KitchenTicketBatch' THEN
  IF NEW.status<>'QUEUED' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'new batch must be queued at version one' USING ERRCODE='23514'; END IF;
  IF NEW."stationId" IS NULL THEN
   IF NEW.id<>NEW."ticketId" THEN RAISE EXCEPTION 'unassigned batch identity mismatch' USING ERRCODE='23514'; END IF;
   NEW."stationCode":=NULL; NEW."stationName":=NULL;
  ELSE
   SELECT * INTO station FROM public."KitchenStation" WHERE "organizationId"=NEW."organizationId"
    AND "locationId"=NEW."locationId" AND id=NEW."stationId" FOR SHARE;
   IF station.id IS NULL OR station.status<>'ACTIVE' THEN
    RAISE EXCEPTION 'ticket routing requires active local station' USING ERRCODE='23514'; END IF;
   NEW."stationCode":=station.code; NEW."stationName":=station.name;
  END IF;
  NEW."createdAt":=ticket."createdAt"; NEW."updatedAt":=ticket."createdAt";
  NEW."updatedByUserId":=ticket."sentByUserId";
 ELSE
  SELECT oi."productId" INTO item_product FROM public."KitchenTicketItem" ki
   JOIN public."OrderItem" oi ON oi.id=ki."orderItemId" AND oi."organizationId"=ki."organizationId" AND oi."locationId"=ki."locationId"
   WHERE ki.id=NEW."ticketItemId" AND ki."organizationId"=NEW."organizationId" AND ki."ticketId"=NEW."ticketId";
  SELECT * INTO route FROM public."KitchenRoutingCommand" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "productId"=item_product AND status='SUCCEEDED' ORDER BY "resultVersion" DESC LIMIT 1;
  SELECT "stationId" INTO batch_station FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND id=NEW."batchId";
  IF item_product IS NULL OR NOT FOUND OR batch_station IS DISTINCT FROM route."stationId" THEN
   RAISE EXCEPTION 'batch item must match current scoped product routing' USING ERRCODE='23514'; END IF;
  NEW."routingCommandId":=route.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_batch_validation BEFORE INSERT ON "KitchenTicketBatch" FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_batch_child();
CREATE TRIGGER kitchen_batch_item_validation BEFORE INSERT ON "KitchenTicketBatchItem" FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_batch_child();

CREATE OR REPLACE FUNCTION public.assign_kitchen_batch_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item_product uuid; station_id uuid; batch_id uuid;
BEGIN
 SELECT "productId" INTO item_product FROM public."OrderItem" WHERE id=NEW."orderItemId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
 SELECT "stationId" INTO station_id FROM public."KitchenRoutingCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "productId"=item_product AND status='SUCCEEDED' ORDER BY "resultVersion" DESC LIMIT 1;
 SELECT id INTO batch_id FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND "stationId" IS NOT DISTINCT FROM station_id;
 IF batch_id IS NULL THEN
  batch_id:=CASE WHEN station_id IS NULL THEN NEW."ticketId" ELSE gen_random_uuid() END;
  INSERT INTO public."KitchenTicketBatch"(id,"organizationId","locationId","ticketId","stationId")
   VALUES(batch_id,NEW."organizationId",NEW."locationId",NEW."ticketId",station_id);
 END IF;
 INSERT INTO public."KitchenTicketBatchItem"("organizationId","locationId","ticketId","batchId","ticketItemId")
  VALUES(NEW."organizationId",NEW."locationId",NEW."ticketId",batch_id,NEW.id);
 RETURN NULL;
END $$;

CREATE FUNCTION public.protect_kitchen_batch_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent public."KitchenTicket";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kitchen batches cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO parent FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId" FOR UPDATE;
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId")
  OR NEW.version<>OLD.version+1
  OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt'])
  OR NOT ((parent.status='CANCELLED' AND NEW.status='CANCELLED' AND OLD.status<>'CANCELLED')
   OR (parent.status<>'CANCELLED' AND ((OLD.status='QUEUED' AND NEW.status='PREPARING')
    OR (OLD.status='PREPARING' AND NEW.status IN ('PARTIALLY_READY','READY'))
    OR (OLD.status='PARTIALLY_READY' AND NEW.status='READY')))) THEN
  RAISE EXCEPTION 'invalid kitchen batch transition or immutable snapshot mutation' USING ERRCODE='23514'; END IF;
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_batch_progress BEFORE UPDATE OR DELETE ON "KitchenTicketBatch"
 FOR EACH ROW EXECUTE FUNCTION public.protect_kitchen_batch_progress();

CREATE FUNCTION public.kitchen_batch_status(org_id uuid, ticket_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN bool_and(status='CANCELLED') THEN 'CANCELLED'
  WHEN bool_and(status='READY') THEN 'READY'
  WHEN bool_or(status IN ('READY','PARTIALLY_READY')) THEN 'PARTIALLY_READY'
  WHEN bool_or(status='PREPARING') THEN 'PREPARING' ELSE 'QUEUED' END
 FROM public."KitchenTicketBatch" WHERE "organizationId"=org_id AND "ticketId"=ticket_id
$$;

CREATE FUNCTION public.sync_legacy_kitchen_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Explicit single unassigned tickets retain the existing whole-ticket workflow.
 -- Cancellation is always order-wide, including already-ready station batches.
 IF NEW.status='CANCELLED' OR NOT EXISTS (SELECT 1 FROM public."KitchenTicketBatch"
  WHERE "organizationId"=NEW."organizationId" AND "ticketId"=NEW.id AND "stationId" IS NOT NULL) THEN
  UPDATE public."KitchenTicketBatch" SET status=public.effective_kitchen_status(NEW.status),version=version+1,
   "updatedByUserId"=NEW."updatedByUserId", "updatedAt"=statement_timestamp()
   WHERE "organizationId"=NEW."organizationId" AND "ticketId"=NEW.id AND status<>public.effective_kitchen_status(NEW.status);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_legacy_batch_sync AFTER UPDATE ON "KitchenTicket"
 FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_kitchen_batch();

CREATE FUNCTION public.check_kitchen_batch_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket_id uuid; parent public."KitchenTicket"; parent_xmin xid;
BEGIN
 ticket_id:=CASE WHEN TG_TABLE_NAME='KitchenTicket' THEN NEW.id ELSE NEW."ticketId" END;
 SELECT * INTO parent FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId" AND id=ticket_id;
 SELECT xmin INTO parent_xmin FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId" AND id=ticket_id;
 IF public.effective_kitchen_status(parent.status) IS DISTINCT FROM public.kitchen_batch_status(NEW."organizationId",ticket_id)
  OR (TG_TABLE_NAME='KitchenTicketBatch' AND parent_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid)
  OR EXISTS (SELECT 1 FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId" AND "ticketId"=ticket_id
   AND (status='CANCELLED')<>(parent.status='CANCELLED')) THEN
  RAISE EXCEPTION 'ticket progress requires atomic parent update and all station batches' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER kitchen_parent_batch_progress AFTER INSERT OR UPDATE ON "KitchenTicket"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_batch_progress();
CREATE CONSTRAINT TRIGGER kitchen_child_batch_progress AFTER UPDATE ON "KitchenTicketBatch"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_batch_progress();

CREATE OR REPLACE FUNCTION public.protect_kitchen_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; previous_status text; station_progress boolean;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF order_row.status NOT IN ('DRAFT','CONFIRMED') OR order_row."kitchenStatus"<>'NOT_SENT' OR NEW.status<>'QUEUED'
   OR NEW.version<>1 OR NEW.revision<>1 OR NEW."orderVersion"<>order_row.version+1 THEN
   RAISE EXCEPTION 'initial kitchen snapshot requires an unsent draft or confirmed order and its next version' USING ERRCODE='23514'; END IF;
 ELSE
  previous_status:=public.effective_kitchen_status(OLD.status);
  SELECT EXISTS(SELECT 1 FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId" AND "ticketId"=NEW.id
   AND "stationId" IS NOT NULL) AND EXISTS(SELECT 1 FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
   AND "ticketId"=NEW.id AND version>1 AND xmin=pg_current_xact_id()::text::xid) INTO station_progress;
  IF NEW.version<>OLD.version+1 OR NEW."updatedByUserId" IS NULL
   OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt'])
   OR NOT ((previous_status='QUEUED' AND NEW.status IN ('PREPARING','CANCELLED'))
    OR (previous_status='PREPARING' AND NEW.status IN ('PARTIALLY_READY','READY','CANCELLED'))
    OR (previous_status='PARTIALLY_READY' AND NEW.status IN ('READY','CANCELLED'))
    OR (previous_status='READY' AND NEW.status='CANCELLED')
    OR (station_progress AND previous_status=NEW.status AND NEW.status IN ('PREPARING','PARTIALLY_READY')))
   OR public.effective_order_status(order_row.status,order_row."kitchenStatus") NOT IN ('CONFIRMED','IN_PROGRESS','READY') THEN
   RAISE EXCEPTION 'invalid kitchen transition or immutable ticket mutation' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_kitchen_batch_progress(),public.kitchen_batch_status(uuid,uuid),
 public.sync_legacy_kitchen_batch(),public.check_kitchen_batch_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_batch_status(uuid,uuid) TO pos_runtime;
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicket','KitchenTicketItem','KitchenTicketBatch','KitchenTicketBatchItem'] LOOP
  EXECUTE format('DROP POLICY migration_kitchen_backfill ON %I',rel);
 END LOOP;
END $$;
COMMIT;
