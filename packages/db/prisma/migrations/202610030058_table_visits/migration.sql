BEGIN;
CREATE TABLE "DiningTableGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "tableId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0), PRIMARY KEY ("organizationId","locationId","tableId"),
 FOREIGN KEY ("organizationId","locationId","tableId") REFERENCES "DiningTable"("organizationId","locationId",id)
);
CREATE TABLE "TableVisit" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "tableId" uuid NOT NULL,
 "tableCode" text NOT NULL, "tableName" text NOT NULL,
 status text NOT NULL CHECK (status IN ('OPEN','CLOSED')),
 version integer NOT NULL CHECK (version>0), "guestCount" integer NOT NULL CHECK ("guestCount" BETWEEN 1 AND 999),
 "waiterUserId" uuid NOT NULL, "waiterDisplayName" text NOT NULL,
 "openedAt" timestamptz(3) NOT NULL, "closedAt" timestamptz(3),
 "billRequested" boolean NOT NULL, "billRequestedAt" timestamptz(3), "billRequestEventId" uuid,
 "lastEventId" uuid NOT NULL,
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","locationId","tableId",id),
 FOREIGN KEY ("organizationId","locationId","tableId") REFERENCES "DiningTable"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","waiterUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK ((status='OPEN' AND "closedAt" IS NULL) OR (status='CLOSED' AND "closedAt" IS NOT NULL AND NOT "billRequested")),
 CHECK (("billRequested" AND "billRequestedAt" IS NOT NULL AND "billRequestEventId" IS NOT NULL)
  OR (NOT "billRequested" AND "billRequestedAt" IS NULL AND "billRequestEventId" IS NULL))
);
CREATE UNIQUE INDEX table_visit_one_open ON "TableVisit" ("organizationId","locationId","tableId") WHERE status='OPEN';
CREATE TABLE "TableVisitGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "visitId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0), PRIMARY KEY ("organizationId","locationId","visitId"),
 FOREIGN KEY ("organizationId","locationId","visitId") REFERENCES "TableVisit"("organizationId","locationId",id)
);
CREATE TABLE "TableVisitEvent" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "visitId" uuid NOT NULL, "tableId" uuid NOT NULL, "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CHECK (kind IN ('OPEN','GUEST_COUNT_CHANGED','BILL_REQUESTED','BILL_CANCELLED','WAITER_CHANGED','CLOSE')),
 "actorUserId" uuid NOT NULL, "actorDisplayName" text NOT NULL DEFAULT '',
 "previousVersion" integer NOT NULL CHECK ("previousVersion">=0), "resultVersion" integer NOT NULL CHECK ("resultVersion"="previousVersion"+1),
 "guestCount" integer, "targetWaiterUserId" uuid, reason text,
 "previousGuestCount" integer, "previousWaiterUserId" uuid, "previousWaiterDisplayName" text, "previousBillRequested" boolean,
 "resultSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","visitId",id),
 UNIQUE ("organizationId","locationId","requestKey"), UNIQUE ("organizationId","visitId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId","tableId","visitId") REFERENCES "TableVisit"("organizationId","locationId","tableId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","targetWaiterUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","previousWaiterUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK ((kind='GUEST_COUNT_CHANGED' AND "guestCount" BETWEEN 1 AND 999) OR (kind<>'GUEST_COUNT_CHANGED' AND "guestCount" IS NULL)),
 CHECK ((kind='WAITER_CHANGED' AND "targetWaiterUserId" IS NOT NULL) OR (kind<>'WAITER_CHANGED' AND "targetWaiterUserId" IS NULL)),
 CHECK ((kind IN ('WAITER_CHANGED','CLOSE') AND reason IS NOT NULL AND reason=btrim(reason) AND length(reason) BETWEEN 3 AND 500)
  OR (kind NOT IN ('WAITER_CHANGED','CLOSE') AND reason IS NULL))
);
CREATE TABLE "TableVisitCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('OPEN','GUEST_COUNT_CHANGED','BILL_REQUESTED','BILL_CANCELLED','WAITER_CHANGED','CLOSE')),
 "tableId" uuid, "visitId" uuid, "targetWaiterUserId" uuid,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')), "requestHash" text, "resultEventId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId","requestKey"), UNIQUE ("organizationId","resultEventId"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","tableId") REFERENCES "DiningTable"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","visitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","targetWaiterUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","resultEventId") REFERENCES "TableVisitEvent"("organizationId","locationId",id) DEFERRABLE INITIALLY DEFERRED,
 CHECK ((kind='OPEN' AND "tableId" IS NOT NULL AND "visitId" IS NULL)
  OR (kind<>'OPEN' AND "tableId" IS NULL AND "visitId" IS NOT NULL)),
 CHECK ((kind='WAITER_CHANGED' AND "targetWaiterUserId" IS NOT NULL) OR (kind<>'WAITER_CHANGED' AND "targetWaiterUserId" IS NULL)),
 CHECK ((status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$' AND "resultEventId" IS NOT NULL)
  OR (status='RETIRED' AND "requestHash" IS NULL AND "resultEventId" IS NULL))
);
ALTER TABLE "TableVisit" ADD CONSTRAINT table_visit_last_event_fk
 FOREIGN KEY ("organizationId","locationId",id,"lastEventId") REFERENCES "TableVisitEvent"("organizationId","locationId","visitId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TableVisit" ADD CONSTRAINT table_visit_bill_event_fk
 FOREIGN KEY ("organizationId","locationId",id,"billRequestEventId") REFERENCES "TableVisitEvent"("organizationId","locationId","visitId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TableVisitEvent" ADD CONSTRAINT table_visit_event_command_fk
 FOREIGN KEY ("organizationId","locationId","requestKey") REFERENCES "TableVisitCommand"("organizationId","locationId","requestKey") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Order" ADD COLUMN "tableVisitId" uuid;
ALTER TABLE "Order" ADD CONSTRAINT order_table_visit_fk FOREIGN KEY ("organizationId","locationId","tableVisitId")
 REFERENCES "TableVisit"("organizationId","locationId",id);
CREATE INDEX order_table_visit_lookup ON "Order" ("organizationId","locationId","tableVisitId",number DESC) WHERE "tableVisitId" IS NOT NULL;

CREATE FUNCTION public.prepare_dining_table(org uuid,loc uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public."DiningTable" WHERE "organizationId"=org AND "locationId"=loc AND id=target FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scoped dining table required' USING ERRCODE='23514'; END IF;
 INSERT INTO public."DiningTableGate" ("organizationId","locationId","tableId",revision) VALUES (org,loc,target,1)
 ON CONFLICT ("organizationId","locationId","tableId") DO UPDATE SET revision="DiningTableGate".revision+1;
END $$;
CREATE FUNCTION public.prepare_table_visit(org uuid,loc uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public."TableVisit" WHERE "organizationId"=org AND "locationId"=loc AND id=target FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scoped table visit required' USING ERRCODE='23514'; END IF;
 INSERT INTO public."TableVisitGate" ("organizationId","locationId","visitId",revision) VALUES (org,loc,target,1)
 ON CONFLICT ("organizationId","locationId","visitId") DO UPDATE SET revision="TableVisitGate".revision+1;
END $$;
CREATE FUNCTION public.prepare_order_table_visit(org uuid,loc uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE visit uuid;
BEGIN
 SELECT "tableVisitId" INTO visit FROM public."Order" WHERE "organizationId"=org AND "locationId"=loc AND id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scoped order required' USING ERRCODE='23514'; END IF;
 IF visit IS NOT NULL THEN PERFORM public.prepare_table_visit(org,loc,visit); END IF;
END $$;
CREATE FUNCTION public.table_visit_snapshot(v public."TableVisit") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT to_jsonb(v)-ARRAY['organizationId','lastEventId']
$$;
-- The stored snapshot uses typed column names, including waiterUserId/waiterDisplayName.
-- API mapping alone nests waiter:{id,displayName}; every source value is immutable in the event.
CREATE FUNCTION public.table_visit_close_blocked(org uuid,loc uuid,target uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (SELECT 1 FROM public."Order" o WHERE o."organizationId"=org AND o."locationId"=loc AND o."tableVisitId"=target
  AND (o.status NOT IN ('COMPLETED','CANCELLED') OR (o.status='COMPLETED'
   AND NOT EXISTS (SELECT 1 FROM public."Checkout" c WHERE c."organizationId"=org AND c."locationId"=loc AND c."orderId"=o.id AND c.mode='DEMO')
   AND public.order_net_paid(org,o.id)<o.total)))
$$;

DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['DiningTableGate','TableVisit','TableVisitGate','TableVisitEvent','TableVisitCommand'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',target);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',target);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',target);
 END LOOP;
END $$;
GRANT UPDATE(revision) ON "DiningTableGate","TableVisitGate" TO pos_runtime;
GRANT UPDATE(status,version,"guestCount","waiterUserId","waiterDisplayName","closedAt","billRequested","billRequestedAt","billRequestEventId","lastEventId") ON "TableVisit" TO pos_runtime;
CREATE FUNCTION public.protect_table_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'table gates are permanent' USING ERRCODE='23514'; END IF;
 IF (TG_OP='INSERT' AND NEW.revision<>1) OR (TG_OP='UPDATE' AND
  (NEW.revision<>OLD.revision+1 OR (to_jsonb(NEW)-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'revision'))) THEN
  RAISE EXCEPTION 'table gate identity and revision are protected' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_table_gate() FROM PUBLIC;
CREATE TRIGGER table_gate_validation BEFORE INSERT OR UPDATE OR DELETE ON "DiningTableGate"
 FOR EACH ROW EXECUTE FUNCTION public.protect_table_gate();
CREATE TRIGGER visit_gate_validation BEFORE INSERT OR UPDATE OR DELETE ON "TableVisitGate"
 FOR EACH ROW EXECUTE FUNCTION public.protect_table_gate();
CREATE TRIGGER visit_event_immutable BEFORE UPDATE OR DELETE ON "TableVisitEvent"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER visit_command_immutable BEFORE UPDATE OR DELETE ON "TableVisitCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.guard_dining_table_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='ARCHIVED' AND OLD.status='ACTIVE' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW.id);
  IF EXISTS (SELECT 1 FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "tableId"=NEW.id AND status='OPEN') THEN
   RAISE EXCEPTION 'table has an open visit' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dining_table_visit_archive BEFORE UPDATE ON "DiningTable"
 FOR EACH ROW EXECUTE FUNCTION public.guard_dining_table_archive();

CREATE FUNCTION public.guard_order_table_visit() RETURNS trigger
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
 IF NEW."serviceType"<>'DINE_IN' OR NEW."tableLabel" IS DISTINCT FROM v."tableCode"
  OR (TG_OP='INSERT' AND v.status<>'OPEN') THEN
  RAISE EXCEPTION 'order requires the open scoped visit and its table snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER x_table_visit_order BEFORE INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.guard_order_table_visit();

CREATE FUNCTION public.apply_table_visit_event() RETURNS trigger
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
    AND "tableVisitId"=v.id AND status<>'CANCELLED') THEN
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
CREATE TRIGGER visit_event_application BEFORE INSERT ON "TableVisitEvent"
 FOR EACH ROW EXECUTE FUNCTION public.apply_table_visit_event();

CREATE FUNCTION public.protect_table_visit_projection() RETURNS trigger
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
   OR (to_jsonb(NEW)-ARRAY['status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','guestCount','waiterUserId','waiterDisplayName','closedAt','billRequested','billRequestedAt','billRequestEventId','lastEventId']) THEN
   RAISE EXCEPTION 'visit identity and terminal history are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER visit_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON "TableVisit"
 FOR EACH ROW EXECUTE FUNCTION public.protect_table_visit_projection();

CREATE FUNCTION public.check_table_visit_projection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v public."TableVisit"; e public."TableVisitEvent";
BEGIN
 SELECT * INTO v FROM public."TableVisit" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO e FROM public."TableVisitEvent" WHERE "organizationId"=v."organizationId"
  AND "locationId"=v."locationId" AND "visitId"=v.id ORDER BY "resultVersion" DESC LIMIT 1;
 IF e.id IS NULL OR e.id<>v."lastEventId" OR e."resultVersion"<>v.version
  OR e."resultSnapshot" IS DISTINCT FROM public.table_visit_snapshot(v) THEN
  RAISE EXCEPTION 'visit projection requires its exact latest event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER visit_projection_consistency AFTER INSERT OR UPDATE ON "TableVisit"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_table_visit_projection();

CREATE FUNCTION public.validate_table_visit_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit command requires the current scoped actor' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='OPEN' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."tableId");
 ELSE
  PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."visitId");
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER visit_command_validation BEFORE INSERT ON "TableVisitCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_table_visit_command();

CREATE FUNCTION public.check_table_visit_command_pair() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e public."TableVisitEvent"; c public."TableVisitCommand";
BEGIN
 SELECT * INTO c FROM public."TableVisitCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 SELECT * INTO e FROM public."TableVisitEvent" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 IF c.id IS NULL OR (c.status='RETIRED' AND e.id IS NOT NULL)
  OR (c.status='SUCCEEDED' AND (e.id IS NULL OR
   (c."resultEventId",c.kind,c."actorUserId",c."requestHash",c."targetWaiterUserId") IS DISTINCT FROM
   (e.id,e.kind,e."actorUserId",e."requestHash",e."targetWaiterUserId")
   OR (c.kind='OPEN' AND c."tableId" IS DISTINCT FROM e."tableId")
   OR (c.kind<>'OPEN' AND c."visitId" IS DISTINCT FROM e."visitId"))) THEN
  RAISE EXCEPTION 'visit command requires exactly its event or retirement without effect' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER visit_command_pair AFTER INSERT ON "TableVisitCommand"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_table_visit_command_pair();
CREATE CONSTRAINT TRIGGER visit_event_pair AFTER INSERT ON "TableVisitEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_table_visit_command_pair();

CREATE INDEX visit_history ON "TableVisitEvent" ("organizationId","locationId","visitId","resultVersion" DESC);
REVOKE ALL ON FUNCTION public.prepare_dining_table(uuid,uuid,uuid),public.prepare_table_visit(uuid,uuid,uuid),
 public.prepare_order_table_visit(uuid,uuid,uuid),public.table_visit_snapshot(public."TableVisit"),
 public.table_visit_close_blocked(uuid,uuid,uuid),public.guard_dining_table_archive(),
 public.guard_order_table_visit(),public.apply_table_visit_event(),public.protect_table_visit_projection(),
 public.check_table_visit_projection(),public.validate_table_visit_command(),public.check_table_visit_command_pair() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_dining_table(uuid,uuid,uuid),public.prepare_table_visit(uuid,uuid,uuid),
 public.prepare_order_table_visit(uuid,uuid,uuid),public.table_visit_snapshot(public."TableVisit"),
 public.table_visit_close_blocked(uuid,uuid,uuid) TO pos_runtime;

CREATE FUNCTION public.prepare_table_visit_finance() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.prepare_order_table_visit(NEW."organizationId",NEW."locationId",NEW."orderId");
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prepare_table_visit_finance() FROM PUBLIC;
CREATE TRIGGER x_table_visit_header BEFORE INSERT ON "Checkout"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_table_visit_finance();
CREATE TRIGGER x_table_visit_header BEFORE INSERT ON "PaymentOperation"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_table_visit_finance();
COMMIT;
