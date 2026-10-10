BEGIN;
-- Historical events identify their original table independently of the visit's current table.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"TableVisitEvent"'::regclass
  AND contype='f' AND confrelid='"TableVisit"'::regclass
  AND pg_get_constraintdef(oid) LIKE '%"tableId"%' LOOP
  EXECUTE format('ALTER TABLE "TableVisitEvent" DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE "TableVisitEvent"
 ADD CONSTRAINT visit_event_visit_fk FOREIGN KEY ("organizationId","locationId","visitId")
 REFERENCES "TableVisit"("organizationId","locationId",id),
 ADD CONSTRAINT visit_event_table_fk FOREIGN KEY ("organizationId","locationId","tableId")
 REFERENCES "DiningTable"("organizationId","locationId",id),
 ADD COLUMN "targetTableId" uuid,
 ADD COLUMN "previousTableCode" text,
 ADD COLUMN "previousTableName" text,
 ADD CONSTRAINT visit_move_target_fk FOREIGN KEY ("organizationId","locationId","targetTableId")
 REFERENCES "DiningTable"("organizationId","locationId",id);
ALTER TABLE "TableVisitCommand" ADD COLUMN "targetTableId" uuid,
 ADD CONSTRAINT visit_command_move_target_fk FOREIGN KEY ("organizationId","locationId","targetTableId")
 REFERENCES "DiningTable"("organizationId","locationId",id);
DO $$ DECLARE c record; rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['TableVisitEvent','TableVisitCommand'] LOOP
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=format('%I',rel)::regclass
   AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%kind = ANY%'
    OR pg_get_constraintdef(oid) LIKE '%reason%') LOOP
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',rel,c.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (kind IN
   (''OPEN'',''GUEST_COUNT_CHANGED'',''BILL_REQUESTED'',''BILL_CANCELLED'',''WAITER_CHANGED'',''CLOSE'',''MOVED''))',rel,rel||'_kind_allowed');
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK
   ((kind=''MOVED'' AND "targetTableId" IS NOT NULL) OR (kind<>''MOVED'' AND "targetTableId" IS NULL))',rel,rel||'_move_target');
 END LOOP;
END $$;
ALTER TABLE "TableVisitEvent" ADD CONSTRAINT visit_reason_required CHECK
 ((kind IN ('WAITER_CHANGED','CLOSE','MOVED') AND reason IS NOT NULL AND reason=btrim(reason) AND length(reason) BETWEEN 3 AND 500)
 OR (kind NOT IN ('WAITER_CHANGED','CLOSE','MOVED') AND reason IS NULL));
GRANT UPDATE("tableId","tableCode","tableName") ON "TableVisit" TO pos_runtime;
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
   OR (to_jsonb(NEW)-ARRAY['tableId','tableCode','tableName','status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['tableId','tableCode','tableName','status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId']) THEN
   RAISE EXCEPTION 'visit identity and terminal history are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_order_table_visit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v public."TableVisit";
BEGIN
 IF TG_OP='UPDATE' AND NEW."tableVisitId" IS DISTINCT FROM OLD."tableVisitId" THEN
  RAISE EXCEPTION 'order visit link is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW."tableVisitId" IS NULL THEN RETURN NEW; END IF;
 PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."tableVisitId");
 SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."tableVisitId";
 IF NEW."serviceType"<>'DINE_IN'
  OR (TG_OP='INSERT' AND NEW."tableLabel" IS DISTINCT FROM v."tableCode")
  OR (TG_OP='UPDATE' AND NEW."tableLabel" IS DISTINCT FROM OLD."tableLabel")
  OR (TG_OP='INSERT' AND v.status<>'OPEN') THEN
  RAISE EXCEPTION 'order requires the open scoped visit and its table snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_table_visit_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit command requires the current scoped actor' USING ERRCODE='23514';
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
   (c."resultEventId",c.kind,c."actorUserId",c."requestHash",c."targetWaiterUserId",c."targetTableId") IS DISTINCT FROM
   (e.id,e.kind,e."actorUserId",e."requestHash",e."targetWaiterUserId",e."targetTableId")
   OR (c.kind='OPEN' AND c."tableId" IS DISTINCT FROM e."tableId")
   OR (c.kind<>'OPEN' AND c."visitId" IS DISTINCT FROM e."visitId"))) THEN
  RAISE EXCEPTION 'visit command requires exactly its event or retirement without effect' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER visit_event_application ON "TableVisitEvent";
CREATE TRIGGER visit_event_application BEFORE INSERT ON "TableVisitEvent"
 FOR EACH ROW WHEN (NEW.kind<>'MOVED') EXECUTE FUNCTION public.apply_table_visit_event();
CREATE FUNCTION public.apply_table_visit_move() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v public."TableVisit"; target public."DiningTable";
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit move requires current scoped actor' USING ERRCODE='23514';
 END IF;
 -- All move/retirement paths lock destination before visit. Order paths never lock a table.
 PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."targetTableId");
 PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."visitId");
 SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."visitId";
 SELECT * INTO target FROM public."DiningTable" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."targetTableId";
 IF v.status<>'OPEN' OR v.version<>NEW."previousVersion" OR v."tableId"<>NEW."tableId"
  OR target.status<>'ACTIVE' OR target.id=v."tableId"
  OR EXISTS (SELECT 1 FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "tableId"=target.id AND status='OPEN') THEN
  RAISE EXCEPTION 'move requires current open visit and a free active destination' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser"
  WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 NEW."previousTableCode":=v."tableCode"; NEW."previousTableName":=v."tableName";
 NEW."previousGuestCount":=v."guestCount"; NEW."previousWaiterUserId":=v."waiterUserId";
 NEW."previousWaiterDisplayName":=v."waiterDisplayName"; NEW."previousBillRequested":=v."billRequested";
 UPDATE public."TableVisit" SET "tableId"=target.id,"tableCode"=target.code,"tableName"=target.name,
  version=NEW."resultVersion","lastEventId"=NEW.id
  WHERE "organizationId"=NEW."organizationId" AND id=v.id RETURNING * INTO v;
 NEW."resultSnapshot":=public.table_visit_snapshot(v);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_table_visit_move() FROM PUBLIC;
CREATE TRIGGER visit_move_application BEFORE INSERT ON "TableVisitEvent"
 FOR EACH ROW WHEN (NEW.kind='MOVED') EXECUTE FUNCTION public.apply_table_visit_move();
COMMIT;
