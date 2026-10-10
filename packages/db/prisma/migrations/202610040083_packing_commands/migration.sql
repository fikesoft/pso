BEGIN;
CREATE TABLE "PackingCommand" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL, "sessionId" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, action text NOT NULL CHECK(action IN ('START','CHECK_ITEM','COMPLETE')),
 status text NOT NULL CHECK(status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "expectedVersion" integer, "resultVersion" integer, "resultStatus" text,
 "itemId" uuid, checked boolean, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","requestKey"), UNIQUE("organizationId","locationId","sessionId",id),
 UNIQUE("organizationId","sessionId","resultVersion"),
 FOREIGN KEY("organizationId","locationId","sessionId") REFERENCES "PackingSession"("organizationId","locationId",id),
 FOREIGN KEY("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","locationId","sessionId","itemId") REFERENCES "PackingItem"("organizationId","locationId","sessionId",id),
 CHECK((status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL AND "resultVersion" IS NULL
   AND "resultStatus" IS NULL AND "itemId" IS NULL AND checked IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND "expectedVersion" IS NOT NULL AND "expectedVersion" BETWEEN 1 AND 2147483646
   AND "resultVersion" IS NOT NULL AND "resultVersion"="expectedVersion"+1 AND "resultStatus" IS NOT NULL
   AND ((action='START' AND "resultStatus"='PACKING' AND "itemId" IS NULL AND checked IS NULL)
    OR (action='CHECK_ITEM' AND "resultStatus"='PACKING' AND "itemId" IS NOT NULL AND checked IS NOT NULL)
    OR (action='COMPLETE' AND "resultStatus"='READY' AND "itemId" IS NULL AND checked IS NULL))))
);
ALTER TABLE "PackingCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackingCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "PackingCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "PackingCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "PackingCommand" TO pos_runtime;
CREATE TRIGGER packing_command_immutable BEFORE UPDATE OR DELETE ON "PackingCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "PackingSession" ADD COLUMN "lastCommandId" uuid;
ALTER TABLE "PackingItem" ADD COLUMN "lastCommandId" uuid;
ALTER TABLE "PackingSession" ADD FOREIGN KEY("organizationId","locationId",id,"lastCommandId")
 REFERENCES "PackingCommand"("organizationId","locationId","sessionId",id);
ALTER TABLE "PackingItem" ADD FOREIGN KEY("organizationId","locationId","sessionId","lastCommandId")
 REFERENCES "PackingCommand"("organizationId","locationId","sessionId",id);
GRANT UPDATE("lastCommandId","startedAt","startedByUserId","completedAt","completedByUserId") ON "PackingSession" TO pos_runtime;
GRANT UPDATE(checked,"checkedAt","checkedByUserId","lastCommandId") ON "PackingItem" TO pos_runtime;

CREATE FUNCTION public.validate_packing_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE session public."PackingSession"; parent public."Order"; item public."PackingItem";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId"::text,0));
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'packing requires current active scoped actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO session FROM public."PackingSession" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."sessionId" FOR UPDATE;
 IF session.id IS NULL THEN RAISE EXCEPTION 'packing requires scoped session' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  SELECT * INTO parent FROM public."Order" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=session."orderId" FOR UPDATE;
  IF NEW."expectedVersion" IS DISTINCT FROM session.version THEN
   RAISE EXCEPTION 'packing version conflict' USING ERRCODE='23514'; END IF;
  IF parent.id IS NULL OR parent."kitchenStatus"<>'READY'
   OR public.effective_order_status(parent.status,parent."kitchenStatus") NOT IN ('IN_PROGRESS','READY')
   OR NOT EXISTS(SELECT 1 FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
    AND id=session."ticketId" AND status='READY') THEN
   RAISE EXCEPTION 'packing requires active order with kitchen ready' USING ERRCODE='23514'; END IF;
  IF NEW.action='START' THEN
   IF session.status<>'WAITING' THEN RAISE EXCEPTION 'packing already started or closed' USING ERRCODE='23514'; END IF;
  ELSIF NEW.action='CHECK_ITEM' THEN
   SELECT * INTO item FROM public."PackingItem" WHERE "organizationId"=NEW."organizationId"
    AND "locationId"=NEW."locationId" AND "sessionId"=session.id AND id=NEW."itemId" FOR UPDATE;
   IF session.status<>'PACKING' OR item.id IS NULL OR NEW.checked IS NULL OR item.checked=NEW.checked THEN
    RAISE EXCEPTION 'packing check requires active session and changed scoped item' USING ERRCODE='23514'; END IF;
  ELSIF NEW.action='COMPLETE' THEN
   IF session.status<>'PACKING'
    OR NOT EXISTS(SELECT 1 FROM public."PackingItem" WHERE "organizationId"=NEW."organizationId" AND "sessionId"=session.id)
    OR EXISTS(SELECT 1 FROM public."PackingItem" WHERE "organizationId"=NEW."organizationId" AND "sessionId"=session.id AND NOT checked) THEN
    RAISE EXCEPTION 'packing completion requires every item checked' USING ERRCODE='23514'; END IF;
  END IF;
  NEW."resultVersion":=session.version+1;
  NEW."resultStatus":=CASE WHEN NEW.action='COMPLETE' THEN 'READY' ELSE 'PACKING' END;
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER packing_command_validation BEFORE INSERT ON "PackingCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_packing_command();

CREATE FUNCTION public.protect_packing_check() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE command public."PackingCommand"; command_xmin xid; session public."PackingSession";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'packing checklist cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO session FROM public."PackingSession" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."sessionId" FOR UPDATE;
 SELECT * INTO command FROM public."PackingCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "sessionId"=NEW."sessionId" AND id=NEW."lastCommandId";
 SELECT xmin INTO command_xmin FROM public."PackingCommand" WHERE id=NEW."lastCommandId";
 IF command.id IS NULL OR command.status<>'SUCCEEDED' OR command.action<>'CHECK_ITEM'
  OR command_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR command."itemId" IS DISTINCT FROM NEW.id OR command.checked IS DISTINCT FROM NEW.checked
  OR command."expectedVersion" IS DISTINCT FROM session.version OR session.status<>'PACKING'
  OR NEW.checked=OLD.checked OR NEW."checkedAt" IS DISTINCT FROM command."createdAt"
  OR NEW."checkedByUserId" IS DISTINCT FROM command."actorUserId"
  OR (to_jsonb(NEW)-ARRAY['checked','checkedAt','checkedByUserId','lastCommandId'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checked','checkedAt','checkedByUserId','lastCommandId']) THEN
  RAISE EXCEPTION 'packing check requires its atomic immutable command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER packing_item_immutable ON "PackingItem";
CREATE TRIGGER packing_item_protection BEFORE UPDATE OR DELETE ON "PackingItem"
 FOR EACH ROW EXECUTE FUNCTION public.protect_packing_check();

CREATE FUNCTION public.apply_packing_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='SUCCEEDED' THEN
  IF NEW.action='CHECK_ITEM' THEN
   UPDATE public."PackingItem" SET checked=NEW.checked,"checkedAt"=NEW."createdAt",
    "checkedByUserId"=NEW."actorUserId","lastCommandId"=NEW.id
    WHERE "organizationId"=NEW."organizationId" AND "sessionId"=NEW."sessionId" AND id=NEW."itemId";
  END IF;
  UPDATE public."PackingSession" SET status=NEW."resultStatus",version=NEW."resultVersion",
   "updatedAt"=NEW."createdAt","updatedByUserId"=NEW."actorUserId","lastCommandId"=NEW.id,
   "startedAt"=CASE WHEN NEW.action='START' THEN NEW."createdAt" ELSE "startedAt" END,
   "startedByUserId"=CASE WHEN NEW.action='START' THEN NEW."actorUserId" ELSE "startedByUserId" END,
   "completedAt"=CASE WHEN NEW.action='COMPLETE' THEN NEW."createdAt" ELSE "completedAt" END,
   "completedByUserId"=CASE WHEN NEW.action='COMPLETE' THEN NEW."actorUserId" ELSE "completedByUserId" END
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."sessionId";
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER packing_command_apply AFTER INSERT ON "PackingCommand"
 FOR EACH ROW EXECUTE FUNCTION public.apply_packing_command();

CREATE OR REPLACE FUNCTION public.protect_packing_session() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; parent public."Order"; parent_xmin xid; command public."PackingCommand"; command_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'packing sessions cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."ticketId";
  IF ticket.id IS NULL OR ticket."generationTransaction" IS DISTINCT FROM txid_current()
   OR ticket.status<>'QUEUED' OR NEW.status<>'WAITING' OR NEW.version<>1
   OR NEW."startedAt" IS NOT NULL OR NEW."completedAt" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL
   OR NEW."lastCommandId" IS NOT NULL OR NEW."startedByUserId" IS NOT NULL OR NEW."completedByUserId" IS NOT NULL THEN
   RAISE EXCEPTION 'packing session requires atomic initial kitchen generation' USING ERRCODE='23514'; END IF;
  NEW."createdByUserId":=ticket."sentByUserId"; NEW."updatedByUserId":=ticket."sentByUserId";
  NEW."createdAt":=ticket."createdAt"; NEW."updatedAt":=ticket."createdAt";
 ELSIF NEW.status<>'CANCELLED' THEN
  SELECT * INTO command FROM public."PackingCommand" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "sessionId"=NEW.id AND id=NEW."lastCommandId";
  SELECT xmin INTO command_xmin FROM public."PackingCommand" WHERE id=NEW."lastCommandId";
  IF command.id IS NULL OR command.status<>'SUCCEEDED'
   OR command_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR command."expectedVersion" IS DISTINCT FROM OLD.version OR command."resultVersion" IS DISTINCT FROM NEW.version
   OR command."resultStatus" IS DISTINCT FROM NEW.status OR command."actorUserId" IS DISTINCT FROM NEW."updatedByUserId"
   OR NEW."updatedAt" IS DISTINCT FROM command."createdAt"
   OR NEW."startedAt" IS DISTINCT FROM (CASE WHEN command.action='START' THEN command."createdAt" ELSE OLD."startedAt" END)
   OR NEW."startedByUserId" IS DISTINCT FROM (CASE WHEN command.action='START' THEN command."actorUserId" ELSE OLD."startedByUserId" END)
   OR NEW."completedAt" IS DISTINCT FROM (CASE WHEN command.action='COMPLETE' THEN command."createdAt" ELSE OLD."completedAt" END)
   OR NEW."completedByUserId" IS DISTINCT FROM (CASE WHEN command.action='COMPLETE' THEN command."actorUserId" ELSE OLD."completedByUserId" END)
   OR NOT ((command.action='START' AND OLD.status='WAITING') OR (command.action IN ('CHECK_ITEM','COMPLETE') AND OLD.status='PACKING'))
   OR (to_jsonb(NEW)-ARRAY['status','version','updatedAt','updatedByUserId','lastCommandId','startedAt','startedByUserId','completedAt','completedByUserId'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt','updatedByUserId','lastCommandId','startedAt','startedByUserId','completedAt','completedByUserId']) THEN
   RAISE EXCEPTION 'packing session change requires its atomic operation' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO parent FROM public."Order" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
  SELECT xmin INTO parent_xmin FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND id=NEW."orderId";
  IF parent.id IS NULL OR parent.status<>'CANCELLED' OR OLD.status='CANCELLED' OR NEW.status<>'CANCELLED'
   OR parent_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR NEW."updatedByUserId" IS DISTINCT FROM parent."updatedByUserId"
   OR NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId")
   OR NEW.version<>OLD.version+1
   OR (to_jsonb(NEW)-ARRAY['status','version','updatedByUserId','updatedAt','cancelledAt'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedByUserId','updatedAt','cancelledAt']) THEN
   RAISE EXCEPTION 'packing session change requires its atomic operation' USING ERRCODE='23514'; END IF;
  NEW."cancelledAt":=statement_timestamp(); NEW."updatedAt":=NEW."cancelledAt";
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_packing_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; session public."PackingSession";
BEGIN
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 SELECT * INTO session FROM public."PackingSession" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND id=NEW."sessionId";
 IF ticket.id IS NULL OR ticket."generationTransaction" IS DISTINCT FROM txid_current()
  OR session.id IS NULL OR session.status<>'WAITING' OR session.version<>1
  OR NEW."lastCommandId" IS NOT NULL OR NEW.checked OR NEW."checkedAt" IS NOT NULL OR NEW."checkedByUserId" IS NOT NULL THEN
  RAISE EXCEPTION 'packing checklist requires its atomic kitchen snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.validate_packing_command(),public.protect_packing_check(),public.apply_packing_command() FROM PUBLIC;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
 ('packing.read','Vizualizarea ambalării și verificării',ARRAY['LOCATION'],true),
 ('packing.update','Pornirea și verificarea articolelor',ARRAY['LOCATION'],true),
 ('packing.complete','Confirmarea ambalării pentru predare',ARRAY['LOCATION'],true);
COMMIT;
