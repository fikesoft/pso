BEGIN;
CREATE TABLE "KitchenCourseCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "ticketId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 course text, "requestHash" text, "expectedVersion" integer, "resultVersion" integer,
 "batchIds" uuid[] NOT NULL DEFAULT '{}', "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","requestKey"),
 UNIQUE ("organizationId","locationId","ticketId",id),
 UNIQUE ("organizationId","locationId","ticketId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId","ticketId") REFERENCES "KitchenTicket"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK ((status='RETIRED' AND course IS NULL AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultVersion" IS NULL AND cardinality("batchIds")=0)
  OR (status='SUCCEEDED' AND course IS NOT NULL AND course IN ('1','2','3','ALL')
   AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion" BETWEEN 1 AND 2147483646
   AND "resultVersion" IS NOT NULL AND "resultVersion"="expectedVersion"+1 AND cardinality("batchIds")>0))
);
ALTER TABLE "KitchenCourseCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenCourseCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "KitchenCourseCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "KitchenCourseCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "KitchenCourseCommand" TO pos_runtime;
CREATE TRIGGER kitchen_course_command_immutable BEFORE UPDATE OR DELETE ON "KitchenCourseCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "KitchenTicketBatch" ADD COLUMN "fireCommandId" uuid;
ALTER TABLE "KitchenTicketBatch" ADD FOREIGN KEY ("organizationId","locationId","ticketId","fireCommandId")
 REFERENCES "KitchenCourseCommand"("organizationId","locationId","ticketId",id);
ALTER TABLE "KitchenTicketBatch" ADD CONSTRAINT kitchen_fire_provenance CHECK (
 ("courseNumber"=0 AND "fireCommandId" IS NULL)
 OR ("courseNumber"<>0 AND (("firedAt" IS NULL AND "fireCommandId" IS NULL)
  OR ("firedAt" IS NOT NULL AND "fireCommandId" IS NOT NULL)))
);
GRANT UPDATE("firedAt","fireCommandId") ON "KitchenTicketBatch" TO pos_runtime;

CREATE FUNCTION public.validate_kitchen_course_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; order_status text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'course firing requires current active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId" FOR UPDATE;
 IF ticket.id IS NULL THEN RAISE EXCEPTION 'course firing requires scoped ticket' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  SELECT public.effective_order_status(status,"kitchenStatus") INTO order_status FROM public."Order"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=ticket."orderId" FOR UPDATE;
  IF NEW."expectedVersion" IS DISTINCT FROM ticket.version THEN
   RAISE EXCEPTION 'course firing version conflict' USING ERRCODE='23514'; END IF;
  IF ticket.status NOT IN ('QUEUED','NEW','PREPARING','PARTIALLY_READY')
   OR order_status NOT IN ('CONFIRMED','IN_PROGRESS') THEN
   RAISE EXCEPTION 'course firing requires an active kitchen order' USING ERRCODE='23514'; END IF;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO NEW."batchIds" FROM public."KitchenTicketBatch"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId"
    AND "courseNumber"<>0 AND (NEW.course='ALL' OR "courseNumber"::text=NEW.course)
    AND "firedAt" IS NULL AND status='QUEUED';
  IF cardinality(NEW."batchIds")=0 THEN
   RAISE EXCEPTION 'course firing requires pending batches' USING ERRCODE='23514'; END IF;
  NEW."resultVersion":=ticket.version+1;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_course_command_validation BEFORE INSERT ON "KitchenCourseCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_kitchen_course_command();

CREATE OR REPLACE FUNCTION public.protect_kitchen_batch_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent public."KitchenTicket"; release public."KitchenCourseCommand"; release_xmin xid; firing boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kitchen batches cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO parent FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId" FOR UPDATE;
 firing:=OLD."firedAt" IS NULL AND NEW."firedAt" IS NOT NULL;
 IF firing THEN
  SELECT * INTO release FROM public."KitchenCourseCommand" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND id=NEW."fireCommandId";
  SELECT xmin INTO release_xmin FROM public."KitchenCourseCommand" WHERE id=NEW."fireCommandId";
  IF release.id IS NULL OR release.status<>'SUCCEEDED' OR NOT (NEW.id=ANY(release."batchIds"))
   OR release_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR release."actorUserId" IS DISTINCT FROM NEW."updatedByUserId"
   OR release."expectedVersion" IS DISTINCT FROM parent.version
   OR NEW."firedAt" IS DISTINCT FROM release."createdAt"
   OR OLD.status<>'QUEUED' OR NEW.status<>'QUEUED' OR OLD."courseNumber"=0
   OR parent.status='CANCELLED' THEN
   RAISE EXCEPTION 'course release requires its atomic immutable command' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW."firedAt" IS DISTINCT FROM OLD."firedAt" OR NEW."fireCommandId" IS DISTINCT FROM OLD."fireCommandId" THEN
   RAISE EXCEPTION 'course release provenance is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId")
  OR NEW.version<>OLD.version+1
  OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt','firedAt','fireCommandId'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt','firedAt','fireCommandId'])
  OR NOT (firing OR (parent.status='CANCELLED' AND NEW.status='CANCELLED' AND OLD.status<>'CANCELLED')
   OR (parent.status<>'CANCELLED' AND OLD."firedAt" IS NOT NULL AND ((OLD.status='QUEUED' AND NEW.status='PREPARING')
    OR (OLD.status='PREPARING' AND NEW.status IN ('PARTIALLY_READY','READY'))
    OR (OLD.status='PARTIALLY_READY' AND NEW.status='READY')))) THEN
  RAISE EXCEPTION 'invalid kitchen batch transition or immutable snapshot mutation' USING ERRCODE='23514'; END IF;
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
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
    OR (station_progress AND previous_status=NEW.status AND NEW.status IN ('QUEUED','PREPARING','PARTIALLY_READY')))
   OR public.effective_order_status(order_row.status,order_row."kitchenStatus") NOT IN ('CONFIRMED','IN_PROGRESS','READY') THEN
   RAISE EXCEPTION 'invalid kitchen transition or immutable ticket mutation' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.apply_kitchen_course_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  UPDATE public."KitchenTicketBatch" SET "firedAt"=NEW."createdAt","fireCommandId"=NEW.id,
   version=version+1,"updatedByUserId"=NEW."actorUserId"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
    AND "ticketId"=NEW."ticketId" AND id=ANY(NEW."batchIds");
  UPDATE public."KitchenTicket" SET version=version+1,"updatedByUserId"=NEW."actorUserId","updatedAt"=NEW."createdAt"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_course_command_apply AFTER INSERT ON "KitchenCourseCommand"
 FOR EACH ROW EXECUTE FUNCTION public.apply_kitchen_course_command();
REVOKE ALL ON FUNCTION public.validate_kitchen_course_command(),public.apply_kitchen_course_command() FROM PUBLIC;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable)
 VALUES('kitchen.courses.fire','Lansarea etapelor mesei în bucătărie',ARRAY['LOCATION'],true);
COMMIT;
