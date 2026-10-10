BEGIN;
LOCK TABLE "OrderItem","KitchenTicketItem","KitchenTicketBatch" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "OrderItem" ADD COLUMN "courseNumber" integer NOT NULL DEFAULT 0 CHECK ("courseNumber" BETWEEN 0 AND 3);
ALTER TABLE "KitchenTicketItem" ADD COLUMN "courseNumber" integer NOT NULL DEFAULT 0 CHECK ("courseNumber" BETWEEN 0 AND 3);
ALTER TABLE "KitchenTicketBatch" ADD COLUMN "courseNumber" integer NOT NULL DEFAULT 0 CHECK ("courseNumber" BETWEEN 0 AND 3);
ALTER TABLE "KitchenTicketBatch" ADD COLUMN "firedAt" timestamptz(3);
-- Historical batches were released immediately; their original timer starts at creation.
-- Only this locked migration transaction may update them without progress transitions.
DO $$ BEGIN
 EXECUTE format('CREATE POLICY migration_course_backfill ON "KitchenTicketBatch" TO %I USING (true) WITH CHECK (true)',current_user);
END $$;
DROP TRIGGER kitchen_batch_progress ON "KitchenTicketBatch";
DROP TRIGGER kitchen_child_batch_progress ON "KitchenTicketBatch";
UPDATE "KitchenTicketBatch" SET "firedAt"="createdAt";
DROP POLICY migration_course_backfill ON "KitchenTicketBatch";
ALTER TABLE "KitchenTicketBatch" ADD CONSTRAINT kitchen_course_release_valid CHECK (
 ("courseNumber"<>0 OR "firedAt" IS NOT NULL)
 AND ("firedAt" IS NOT NULL OR status IN ('QUEUED','CANCELLED'))
 AND ("firedAt" IS NULL OR "firedAt">="createdAt")
);
-- Discover the existing generated constraint name without relying on identifier truncation.
DO $$ DECLARE constraint_name text; BEGIN
 SELECT c.conname INTO STRICT constraint_name FROM pg_constraint c
 WHERE c.conrelid='"KitchenTicketBatch"'::regclass AND c.contype='u'
 AND (SELECT array_agg(a.attname::text ORDER BY k.position) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,position)
  JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)
  = ARRAY['organizationId','locationId','ticketId','stationId'];
 EXECUTE format('ALTER TABLE "KitchenTicketBatch" DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE "KitchenTicketBatch" ADD CONSTRAINT kitchen_station_course_unique
 UNIQUE ("organizationId","locationId","ticketId","stationId","courseNumber");
DROP INDEX kitchen_unassigned_batch_unique;
CREATE UNIQUE INDEX kitchen_unassigned_batch_unique ON "KitchenTicketBatch"
 ("organizationId","locationId","ticketId","courseNumber") WHERE "stationId" IS NULL;

CREATE FUNCTION public.seal_kitchen_course() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT "courseNumber" INTO NEW."courseNumber" FROM public."OrderItem"
 WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderItemId";
 IF NEW."courseNumber" IS NULL THEN
  RAISE EXCEPTION 'kitchen course requires the scoped order item' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_course_snapshot BEFORE INSERT ON "KitchenTicketItem"
 FOR EACH ROW EXECUTE FUNCTION public.seal_kitchen_course();
REVOKE ALL ON FUNCTION public.seal_kitchen_course() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.validate_kitchen_batch_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; station public."KitchenStation"; item_product uuid;
 route public."KitchenRoutingCommand"; batch_station uuid; item_course integer; batch_course integer;
BEGIN
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 IF ticket."generationTransaction" IS DISTINCT FROM txid_current() THEN
  RAISE EXCEPTION 'kitchen batches belong to their atomic ticket generation' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='KitchenTicketBatch' THEN
  IF NEW.status<>'QUEUED' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'new batch must be queued at version one' USING ERRCODE='23514'; END IF;
  IF NEW."stationId" IS NULL THEN
   IF NEW."courseNumber"=0 AND NEW.id<>NEW."ticketId" THEN RAISE EXCEPTION 'unassigned batch identity mismatch' USING ERRCODE='23514'; END IF;
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
  NEW."firedAt":=CASE WHEN NEW."courseNumber"=0 THEN ticket."createdAt" ELSE NULL END;
 ELSE
  SELECT oi."productId",ki."courseNumber" INTO item_product,item_course FROM public."KitchenTicketItem" ki
   JOIN public."OrderItem" oi ON oi.id=ki."orderItemId" AND oi."organizationId"=ki."organizationId" AND oi."locationId"=ki."locationId"
   WHERE ki.id=NEW."ticketItemId" AND ki."organizationId"=NEW."organizationId" AND ki."ticketId"=NEW."ticketId";
  SELECT * INTO route FROM public."KitchenRoutingCommand" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "productId"=item_product AND status='SUCCEEDED' ORDER BY "resultVersion" DESC LIMIT 1;
  SELECT "stationId","courseNumber" INTO batch_station,batch_course FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND id=NEW."batchId";
  IF item_product IS NULL OR NOT FOUND OR batch_station IS DISTINCT FROM route."stationId"
   OR batch_course IS DISTINCT FROM item_course THEN
   RAISE EXCEPTION 'batch item must match current scoped product routing' USING ERRCODE='23514'; END IF;
  NEW."routingCommandId":=route.id;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_kitchen_batch_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item_product uuid; station_id uuid; batch_id uuid;
BEGIN
 SELECT "productId" INTO item_product FROM public."OrderItem" WHERE id=NEW."orderItemId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
 SELECT "stationId" INTO station_id FROM public."KitchenRoutingCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "productId"=item_product AND status='SUCCEEDED' ORDER BY "resultVersion" DESC LIMIT 1;
 SELECT id INTO batch_id FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND "stationId" IS NOT DISTINCT FROM station_id
  AND "courseNumber"=NEW."courseNumber";
 IF batch_id IS NULL THEN
  batch_id:=CASE WHEN station_id IS NULL AND NEW."courseNumber"=0 THEN NEW."ticketId" ELSE gen_random_uuid() END;
  INSERT INTO public."KitchenTicketBatch"(id,"organizationId","locationId","ticketId","stationId","courseNumber")
   VALUES(batch_id,NEW."organizationId",NEW."locationId",NEW."ticketId",station_id,NEW."courseNumber");
 END IF;
 INSERT INTO public."KitchenTicketBatchItem"("organizationId","locationId","ticketId","batchId","ticketItemId")
  VALUES(NEW."organizationId",NEW."locationId",NEW."ticketId",batch_id,NEW.id);
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.protect_kitchen_batch_progress() RETURNS trigger
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
   OR (parent.status<>'CANCELLED' AND OLD."firedAt" IS NOT NULL AND ((OLD.status='QUEUED' AND NEW.status='PREPARING')
    OR (OLD.status='PREPARING' AND NEW.status IN ('PARTIALLY_READY','READY'))
    OR (OLD.status='PARTIALLY_READY' AND NEW.status='READY')))) THEN
  RAISE EXCEPTION 'invalid kitchen batch transition or immutable snapshot mutation' USING ERRCODE='23514'; END IF;
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_legacy_kitchen_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Explicit single immediate unassigned tickets retain the existing whole-ticket workflow.
 -- Cancellation is always order-wide, including already-ready station batches.
 IF NEW.status='CANCELLED' OR NOT EXISTS (SELECT 1 FROM public."KitchenTicketBatch"
  WHERE "organizationId"=NEW."organizationId" AND "ticketId"=NEW.id AND ("stationId" IS NOT NULL OR "courseNumber"<>0)) THEN
  UPDATE public."KitchenTicketBatch" SET status=public.effective_kitchen_status(NEW.status),version=version+1,
   "updatedByUserId"=NEW."updatedByUserId", "updatedAt"=statement_timestamp()
   WHERE "organizationId"=NEW."organizationId" AND "ticketId"=NEW.id AND status<>public.effective_kitchen_status(NEW.status);
 END IF;
 RETURN NULL;
END $$;

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
   AND ("stationId" IS NOT NULL OR "courseNumber"<>0)) AND EXISTS(SELECT 1 FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId"
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
CREATE TRIGGER kitchen_batch_progress BEFORE UPDATE OR DELETE ON "KitchenTicketBatch"
 FOR EACH ROW EXECUTE FUNCTION public.protect_kitchen_batch_progress();
CREATE CONSTRAINT TRIGGER kitchen_child_batch_progress AFTER UPDATE ON "KitchenTicketBatch"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_kitchen_batch_progress();
COMMIT;
