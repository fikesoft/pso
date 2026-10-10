BEGIN;
ALTER TABLE "TableVisit" ADD COLUMN "mergedIntoVisitId" uuid,
 ADD CONSTRAINT visit_merge_destination_fk FOREIGN KEY ("organizationId","locationId","mergedIntoVisitId")
 REFERENCES "TableVisit"("organizationId","locationId",id);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"TableVisit"'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%status%' LOOP
  EXECUTE format('ALTER TABLE "TableVisit" DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE "TableVisit" ADD CONSTRAINT visit_lifecycle CHECK
 ((status='OPEN' AND "closedAt" IS NULL AND "mergedIntoVisitId" IS NULL)
  OR (status='CLOSED' AND "closedAt" IS NOT NULL AND "mergedIntoVisitId" IS NULL AND NOT "billRequested")
  OR (status='MERGED' AND "closedAt" IS NOT NULL AND "mergedIntoVisitId" IS NOT NULL AND "mergedIntoVisitId"<>id AND NOT "billRequested"));
CREATE INDEX visit_merge_descendants ON "TableVisit"("organizationId","locationId","mergedIntoVisitId") WHERE "mergedIntoVisitId" IS NOT NULL;
GRANT UPDATE("mergedIntoVisitId") ON "TableVisit" TO pos_runtime;
CREATE TABLE "TableVisitMerge" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
 "sourceVisitId" uuid NOT NULL, "targetVisitId" uuid NOT NULL,
 "sourceVersion" integer NOT NULL CHECK ("sourceVersion">0), "targetVersion" integer NOT NULL CHECK ("targetVersion">0),
 "sourceEventId" uuid NOT NULL, "targetEventId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL, reason text NOT NULL CHECK (reason=btrim(reason) AND length(reason) BETWEEN 3 AND 500),
 "sourceSnapshot" jsonb NOT NULL DEFAULT '{}', "targetSnapshot" jsonb NOT NULL DEFAULT '{}',
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("sourceVisitId"<>"targetVisitId" AND "sourceEventId"<>"targetEventId"),
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId","sourceVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","targetVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","sourceVisitId","sourceEventId") REFERENCES "TableVisitEvent"("organizationId","locationId","visitId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("organizationId","locationId","targetVisitId","targetEventId") REFERENCES "TableVisitEvent"("organizationId","locationId","visitId",id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE "TableVisitMerge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableVisitMerge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "TableVisitMerge" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "TableVisitMerge" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "TableVisitMerge" TO pos_runtime;
CREATE TRIGGER visit_merge_immutable BEFORE UPDATE OR DELETE ON "TableVisitMerge"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "TableVisitEvent" ADD COLUMN "mergeId" uuid, ADD COLUMN "relatedVisitId" uuid,
 ADD CONSTRAINT visit_event_merge_fk FOREIGN KEY ("organizationId","locationId","mergeId") REFERENCES "TableVisitMerge"("organizationId","locationId",id),
 ADD CONSTRAINT visit_event_related_fk FOREIGN KEY ("organizationId","locationId","relatedVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 ADD CONSTRAINT visit_event_merge_fields CHECK ((kind IN ('MERGED','MERGE_RECEIVED') AND "mergeId" IS NOT NULL AND "relatedVisitId" IS NOT NULL)
 OR (kind NOT IN ('MERGED','MERGE_RECEIVED') AND "mergeId" IS NULL AND "relatedVisitId" IS NULL));
ALTER TABLE "TableVisitCommand" ADD COLUMN "targetVisitId" uuid,
 ADD CONSTRAINT visit_command_target_visit_fk FOREIGN KEY ("organizationId","locationId","targetVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 ADD CONSTRAINT visit_command_target_visit CHECK ((kind IN ('MERGED','MERGE_RECEIVED') AND "targetVisitId" IS NOT NULL)
 OR (kind NOT IN ('MERGED','MERGE_RECEIVED') AND "targetVisitId" IS NULL));
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['TableVisitEvent','TableVisitCommand'] LOOP
  EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',rel,rel||'_kind_allowed');
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (kind IN
   (''OPEN'',''GUEST_COUNT_CHANGED'',''BILL_REQUESTED'',''BILL_CANCELLED'',''WAITER_CHANGED'',''CLOSE'',''MOVED'',''MERGED'',''MERGE_RECEIVED''))',rel,rel||'_kind_allowed');
 END LOOP;
END $$;
ALTER TABLE "TableVisitEvent" DROP CONSTRAINT visit_reason_required;
ALTER TABLE "TableVisitEvent" ADD CONSTRAINT visit_reason_required CHECK
 ((kind IN ('WAITER_CHANGED','CLOSE','MOVED','MERGED','MERGE_RECEIVED') AND reason IS NOT NULL AND reason=btrim(reason) AND length(reason) BETWEEN 3 AND 500)
 OR (kind NOT IN ('WAITER_CHANGED','CLOSE','MOVED','MERGED','MERGE_RECEIVED') AND reason IS NULL));
CREATE OR REPLACE FUNCTION public.table_visit_snapshot(v public."TableVisit") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT (to_jsonb(v)-ARRAY['organizationId','lastEventId'])
  - CASE WHEN v."mergedIntoVisitId" IS NULL THEN ARRAY['mergedIntoVisitId'] ELSE ARRAY[]::text[] END
$$;
CREATE FUNCTION public.table_visit_root(org uuid,loc uuid,target uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH RECURSIVE ancestors AS (
  SELECT id,"mergedIntoVisitId" FROM public."TableVisit" WHERE "organizationId"=org AND "locationId"=loc AND id=target
  UNION
  SELECT v.id,v."mergedIntoVisitId" FROM public."TableVisit" v JOIN ancestors a ON v.id=a."mergedIntoVisitId"
   WHERE v."organizationId"=org AND v."locationId"=loc
 ) SELECT id FROM ancestors WHERE "mergedIntoVisitId" IS NULL
$$;
CREATE FUNCTION public.table_visit_members(org uuid,loc uuid,target uuid) RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH RECURSIVE members AS (
  SELECT v.id FROM public."TableVisit" v WHERE v."organizationId"=org AND v."locationId"=loc AND v.id=target
  UNION
  SELECT v.id FROM public."TableVisit" v JOIN members m ON v."mergedIntoVisitId"=m.id
   WHERE v."organizationId"=org AND v."locationId"=loc
 ) SELECT members.id FROM members
$$;
CREATE OR REPLACE FUNCTION public.prepare_table_visit(org uuid,loc uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE root uuid; parent uuid;
BEGIN
 root:=public.table_visit_root(org,loc,target);
 IF root IS NULL THEN RAISE EXCEPTION 'scoped table visit required' USING ERRCODE='23514'; END IF;
 SELECT "mergedIntoVisitId" INTO parent FROM public."TableVisit"
  WHERE "organizationId"=org AND "locationId"=loc AND id=root FOR NO KEY UPDATE;
 -- A merge that won while we waited invalidates the selected lock root. Retry the transaction.
 IF parent IS NOT NULL THEN RAISE EXCEPTION 'visit root changed; retry transaction' USING ERRCODE='40001'; END IF;
 INSERT INTO public."TableVisitGate" ("organizationId","locationId","visitId",revision) VALUES (org,loc,root,1)
 ON CONFLICT ("organizationId","locationId","visitId") DO UPDATE SET revision="TableVisitGate".revision+1;
END $$;
CREATE OR REPLACE FUNCTION public.table_visit_close_blocked(org uuid,loc uuid,target uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (SELECT 1 FROM public."Order" o WHERE o."organizationId"=org AND o."locationId"=loc
  AND o."tableVisitId" IN (SELECT id FROM public.table_visit_members(org,loc,target))
  AND (o.status NOT IN ('COMPLETED','CANCELLED') OR (o.status='COMPLETED'
   AND NOT EXISTS (SELECT 1 FROM public."Checkout" c WHERE c."organizationId"=org AND c."locationId"=loc AND c."orderId"=o.id AND c.mode='DEMO')
   AND public.order_net_paid(org,o.id)<o.total)))
$$;
CREATE OR REPLACE FUNCTION public.protect_table_visit_projection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'visit history is permanent' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'OPEN' OR NEW.version<>1 OR NEW."billRequested" THEN
   RAISE EXCEPTION 'visit must start open at version one' USING ERRCODE='23514';
  END IF;
  NEW."openedAt":=statement_timestamp();
 ELSE
  IF OLD.status<>'OPEN' OR NEW.version NOT IN (OLD.version,OLD.version+1)
   OR (to_jsonb(NEW)-ARRAY['mergedIntoVisitId','tableId','tableCode','tableName','status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['mergedIntoVisitId','tableId','tableCode','tableName','status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId']) THEN
   RAISE EXCEPTION 'visit identity and terminal history are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.check_table_visit_command_pair() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e public."TableVisitEvent"; c public."TableVisitCommand";
BEGIN
 SELECT * INTO c FROM public."TableVisitCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 SELECT * INTO e FROM public."TableVisitEvent" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 IF c.id IS NULL OR (c.status='RETIRED' AND e.id IS NOT NULL)
  OR (c.status='SUCCEEDED' AND (e.id IS NULL OR
   (c."resultEventId",c.kind,c."actorUserId",c."requestHash",c."targetWaiterUserId",c."targetTableId",c."targetVisitId") IS DISTINCT FROM
   (e.id,e.kind,e."actorUserId",e."requestHash",e."targetWaiterUserId",e."targetTableId",e."relatedVisitId")
   OR (c.kind='OPEN' AND c."tableId" IS DISTINCT FROM e."tableId")
   OR (c.kind<>'OPEN' AND c."visitId" IS DISTINCT FROM e."visitId"))) THEN
  RAISE EXCEPTION 'visit command requires exactly its event or retirement without effect' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.apply_table_visit_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v public."TableVisit"; tab public."DiningTable"; waiter_name text;
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit event requires the current scoped actor' USING ERRCODE='23514';
 END IF;
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser"
  WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 NEW."createdAt":=statement_timestamp();
 IF NEW.kind='OPEN' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."tableId");
  SELECT * INTO tab FROM public."DiningTable" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."tableId";
  SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."visitId" FOR NO KEY UPDATE;
  IF tab.status<>'ACTIVE' OR v.id IS NULL OR v.version<>1 OR NEW."previousVersion"<>0
   OR v.status<>'OPEN' OR v."billRequested" OR v."waiterUserId"<>NEW."actorUserId"
   OR v."lastEventId"<>NEW.id OR v."tableId"<>tab.id
   OR (v."tableCode",v."tableName") IS DISTINCT FROM (tab.code,tab.name) THEN
   RAISE EXCEPTION 'invalid initial visit projection' USING ERRCODE='23514';
  END IF;
  UPDATE public."TableVisit" SET "waiterDisplayName"=NEW."actorDisplayName"
   WHERE "organizationId"=NEW."organizationId" AND id=v.id RETURNING * INTO v;
  NEW."previousGuestCount":=NULL; NEW."previousWaiterUserId":=NULL;
  NEW."previousWaiterDisplayName":=NULL; NEW."previousBillRequested":=NULL;
 ELSE
  PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."visitId");
  SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."visitId";
  IF v.status<>'OPEN' OR v.version<>NEW."previousVersion" OR v."tableId"<>NEW."tableId" THEN
   RAISE EXCEPTION 'visit requires the current open version' USING ERRCODE='23514';
  END IF;
  NEW."previousGuestCount":=v."guestCount";
  NEW."previousWaiterUserId":=v."waiterUserId";
  NEW."previousWaiterDisplayName":=v."waiterDisplayName";
  NEW."previousBillRequested":=v."billRequested";
  IF NEW.kind='GUEST_COUNT_CHANGED' THEN
   IF NEW."guestCount" IS NULL OR NEW."guestCount"=v."guestCount" THEN
    RAISE EXCEPTION 'guest count must change' USING ERRCODE='23514';
   END IF;
   v."guestCount":=NEW."guestCount";
  ELSIF NEW.kind='BILL_REQUESTED' THEN
   IF v."billRequested" OR NOT EXISTS (SELECT 1 FROM public."Order" WHERE
    "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
    AND "tableVisitId" IN (SELECT id FROM public.table_visit_members(NEW."organizationId",NEW."locationId",v.id)) AND status<>'CANCELLED') THEN
    RAISE EXCEPTION 'bill request needs a noncancelled order and no active request' USING ERRCODE='23514';
   END IF;
   v."billRequested":=true; v."billRequestedAt":=NEW."createdAt"; v."billRequestEventId":=NEW.id;
  ELSIF NEW.kind='BILL_CANCELLED' THEN
   IF NOT v."billRequested" THEN RAISE EXCEPTION 'no bill request' USING ERRCODE='23514'; END IF;
   v."billRequested":=false; v."billRequestedAt":=NULL; v."billRequestEventId":=NULL;
  ELSIF NEW.kind='WAITER_CHANGED' THEN
   SELECT u."displayName" INTO waiter_name FROM public."CompanyUser" u
    WHERE u."organizationId"=NEW."organizationId" AND u.id=NEW."targetWaiterUserId" AND u.status='ACTIVE'
    AND (EXISTS (SELECT 1 FROM public."Organization" o WHERE o.id=u."organizationId" AND o."primaryAdminUserId"=u.id)
     OR EXISTS (SELECT 1 FROM public."UserLocationAccess" a WHERE a."organizationId"=u."organizationId" AND a."userId"=u.id AND a."locationId"=NEW."locationId"));
   IF waiter_name IS NULL OR v."waiterUserId"=NEW."targetWaiterUserId" THEN
    RAISE EXCEPTION 'new active scoped waiter required' USING ERRCODE='23514';
   END IF;
   v."waiterUserId":=NEW."targetWaiterUserId"; v."waiterDisplayName":=waiter_name;
  ELSIF NEW.kind='CLOSE' THEN
   IF public.table_visit_close_blocked(NEW."organizationId",NEW."locationId",v.id) THEN
    RAISE EXCEPTION 'visit has open orders' USING ERRCODE='23514';
   END IF;
   v.status:='CLOSED'; v."closedAt":=NEW."createdAt";
   v."billRequested":=false; v."billRequestedAt":=NULL; v."billRequestEventId":=NULL;
  END IF;
  UPDATE public."TableVisit" SET status=v.status,version=NEW."resultVersion",
   "guestCount"=v."guestCount","waiterUserId"=v."waiterUserId","waiterDisplayName"=v."waiterDisplayName",
   "closedAt"=v."closedAt","billRequested"=v."billRequested","billRequestedAt"=v."billRequestedAt",
   "billRequestEventId"=v."billRequestEventId","lastEventId"=NEW.id
   WHERE "organizationId"=NEW."organizationId" AND id=v.id RETURNING * INTO v;
 END IF;
 NEW."resultSnapshot":=public.table_visit_snapshot(v);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_table_visit_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit command requires the current scoped actor' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='MERGED' AND NEW.status='RETIRED' THEN
  PERFORM public.prepare_table_visit_merge(NEW."organizationId",NEW."locationId",NEW."visitId",NEW."targetVisitId");
 END IF;
 IF NEW.kind='MOVED' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."targetTableId");
 END IF;
 IF NEW.kind='OPEN' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."tableId");
 ELSE
  PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."visitId");
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE FUNCTION public.prepare_table_visit_merge(org uuid,loc uuid,source uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE selected uuid; v public."TableVisit";
BEGIN
 IF source=target THEN RAISE EXCEPTION 'distinct visits required' USING ERRCODE='23514'; END IF;
 FOR selected IN SELECT unnest(ARRAY[source,target]) ORDER BY 1 LOOP
  SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=org AND "locationId"=loc AND id=selected FOR NO KEY UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'scoped merge visit required' USING ERRCODE='23514'; END IF;
  IF v."mergedIntoVisitId" IS NOT NULL THEN RAISE EXCEPTION 'merge root changed' USING ERRCODE='40001'; END IF;
  PERFORM public.prepare_table_visit(org,loc,selected);
 END LOOP;
END $$;
CREATE FUNCTION public.validate_table_visit_merge() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source public."TableVisit"; target public."TableVisit";
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'merge requires current scoped actor' USING ERRCODE='23514'; END IF;
 PERFORM public.prepare_table_visit_merge(NEW."organizationId",NEW."locationId",NEW."sourceVisitId",NEW."targetVisitId");
 SELECT * INTO source FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId" AND id=NEW."sourceVisitId";
 SELECT * INTO target FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId" AND id=NEW."targetVisitId";
 IF source.status<>'OPEN' OR target.status<>'OPEN' OR source.version<>NEW."sourceVersion" OR target.version<>NEW."targetVersion"
  OR source."guestCount"+target."guestCount">999 THEN
  RAISE EXCEPTION 'merge requires current open versions and valid guest total' USING ERRCODE='23514'; END IF;
 NEW."sourceSnapshot":=public.table_visit_snapshot(source); NEW."targetSnapshot":=public.table_visit_snapshot(target);
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER visit_merge_validate BEFORE INSERT ON "TableVisitMerge" FOR EACH ROW EXECUTE FUNCTION public.validate_table_visit_merge();
CREATE FUNCTION public.apply_table_visit_merge_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE m public."TableVisitMerge"; v public."TableVisit";
BEGIN
 SELECT * INTO m FROM public."TableVisitMerge" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."mergeId";
 IF m.id IS NULL OR (NEW."actorUserId",NEW."requestHash",NEW.reason) IS DISTINCT FROM (m."actorUserId",m."requestHash",m.reason)
  OR (NEW.kind='MERGED' AND (NEW.id,NEW."visitId",NEW."relatedVisitId",NEW."previousVersion",NEW."requestKey")
    IS DISTINCT FROM (m."sourceEventId",m."sourceVisitId",m."targetVisitId",m."sourceVersion",m."requestKey"))
  OR (NEW.kind='MERGE_RECEIVED' AND (NEW.id,NEW."visitId",NEW."relatedVisitId",NEW."previousVersion",NEW."requestKey")
    IS DISTINCT FROM (m."targetEventId",m."targetVisitId",m."sourceVisitId",m."targetVersion",m."targetEventId")) THEN
  RAISE EXCEPTION 'merge event requires exact merge header' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."visitId" FOR NO KEY UPDATE;
 IF v.status<>'OPEN' OR v.version<>NEW."previousVersion" OR v."tableId"<>NEW."tableId" THEN
  RAISE EXCEPTION 'merge event requires current open version' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=m."createdAt";
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 NEW."previousGuestCount":=v."guestCount"; NEW."previousWaiterUserId":=v."waiterUserId";
 NEW."previousWaiterDisplayName":=v."waiterDisplayName"; NEW."previousBillRequested":=v."billRequested";
 IF NEW.kind='MERGED' THEN
  v.status:='MERGED'; v."closedAt":=NEW."createdAt"; v."mergedIntoVisitId":=m."targetVisitId";
  v."billRequested":=false; v."billRequestedAt":=NULL; v."billRequestEventId":=NULL;
 ELSE
  v."guestCount":=v."guestCount"+(m."sourceSnapshot"->>'guestCount')::integer;
  IF NOT v."billRequested" AND (m."sourceSnapshot"->>'billRequested')::boolean THEN
   v."billRequested":=true; v."billRequestedAt":=NEW."createdAt"; v."billRequestEventId":=NEW.id;
  END IF;
 END IF;
 UPDATE public."TableVisit" SET status=v.status,version=NEW."resultVersion","lastEventId"=NEW.id,
  "guestCount"=v."guestCount","closedAt"=v."closedAt","mergedIntoVisitId"=v."mergedIntoVisitId",
  "billRequested"=v."billRequested","billRequestedAt"=v."billRequestedAt","billRequestEventId"=v."billRequestEventId"
  WHERE "organizationId"=NEW."organizationId" AND id=v.id RETURNING * INTO v;
 NEW."resultSnapshot":=public.table_visit_snapshot(v);
 RETURN NEW;
END $$;
DROP TRIGGER visit_event_application ON "TableVisitEvent";
CREATE TRIGGER visit_event_application BEFORE INSERT ON "TableVisitEvent" FOR EACH ROW
 WHEN (NEW.kind NOT IN ('MOVED','MERGED','MERGE_RECEIVED')) EXECUTE FUNCTION public.apply_table_visit_event();
CREATE TRIGGER visit_merge_event_application BEFORE INSERT ON "TableVisitEvent" FOR EACH ROW
 WHEN (NEW.kind IN ('MERGED','MERGE_RECEIVED')) EXECUTE FUNCTION public.apply_table_visit_merge_event();
CREATE FUNCTION public.record_table_visit_merge() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE side text; event_id uuid; visit_id uuid; related uuid; expected integer; key uuid; tab uuid;
BEGIN
 FOREACH side IN ARRAY ARRAY['MERGED','MERGE_RECEIVED'] LOOP
  IF side='MERGED' THEN
   event_id:=NEW."sourceEventId"; visit_id:=NEW."sourceVisitId"; related:=NEW."targetVisitId";
   expected:=NEW."sourceVersion"; key:=NEW."requestKey"; tab:=(NEW."sourceSnapshot"->>'tableId')::uuid;
  ELSE
   event_id:=NEW."targetEventId"; visit_id:=NEW."targetVisitId"; related:=NEW."sourceVisitId";
   expected:=NEW."targetVersion"; key:=NEW."targetEventId"; tab:=(NEW."targetSnapshot"->>'tableId')::uuid;
  END IF;
  INSERT INTO public."TableVisitEvent"(id,"organizationId","locationId","visitId","tableId","requestKey","requestHash",kind,"actorUserId","previousVersion","resultVersion",reason,"mergeId","relatedVisitId")
   VALUES(event_id,NEW."organizationId",NEW."locationId",visit_id,tab,key,NEW."requestHash",side,NEW."actorUserId",expected,expected+1,NEW.reason,NEW.id,related);
  INSERT INTO public."TableVisitCommand"(id,"organizationId","locationId","visitId","requestKey","requestHash",kind,"actorUserId",status,"resultEventId","targetVisitId")
   VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",visit_id,key,NEW."requestHash",side,NEW."actorUserId",'SUCCEEDED',event_id,related);
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER visit_merge_record AFTER INSERT ON "TableVisitMerge" FOR EACH ROW EXECUTE FUNCTION public.record_table_visit_merge();
CREATE FUNCTION public.check_table_visit_merge_pair() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source public."TableVisitEvent"; target public."TableVisitEvent";
BEGIN
 SELECT * INTO source FROM public."TableVisitEvent" WHERE "organizationId"=NEW."organizationId" AND id=NEW."sourceEventId";
 SELECT * INTO target FROM public."TableVisitEvent" WHERE "organizationId"=NEW."organizationId" AND id=NEW."targetEventId";
 IF source."mergeId" IS DISTINCT FROM NEW.id OR target."mergeId" IS DISTINCT FROM NEW.id
  OR source.kind<>'MERGED' OR target.kind<>'MERGE_RECEIVED' THEN
  RAISE EXCEPTION 'merge requires both exact events' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER visit_merge_pair AFTER INSERT ON "TableVisitMerge"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_table_visit_merge_pair();
REVOKE ALL ON FUNCTION public.table_visit_root(uuid,uuid,uuid),public.table_visit_members(uuid,uuid,uuid),
 public.prepare_table_visit_merge(uuid,uuid,uuid,uuid),public.validate_table_visit_merge(),
 public.apply_table_visit_merge_event(),public.record_table_visit_merge(),public.check_table_visit_merge_pair() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_visit_root(uuid,uuid,uuid),public.table_visit_members(uuid,uuid,uuid),public.prepare_table_visit_merge(uuid,uuid,uuid,uuid) TO pos_runtime;
COMMIT;
