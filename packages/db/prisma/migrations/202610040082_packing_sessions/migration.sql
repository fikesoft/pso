BEGIN;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT kitchen_packing_order_identity
 UNIQUE ("organizationId","locationId","orderId",id);

CREATE TABLE "PackingSession" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL, "orderId" uuid NOT NULL, "ticketId" uuid NOT NULL,
 status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','PACKING','READY','CANCELLED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "startedByUserId" uuid, "completedByUserId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" timestamptz(3), "completedAt" timestamptz(3), "cancelledAt" timestamptz(3),
 UNIQUE("organizationId",id), UNIQUE("organizationId","locationId",id),
 UNIQUE("organizationId","locationId","ticketId",id),
 UNIQUE("organizationId","orderId"), UNIQUE("organizationId","ticketId"),
 FOREIGN KEY("organizationId","locationId","orderId","ticketId")
  REFERENCES "KitchenTicket"("organizationId","locationId","orderId",id),
 FOREIGN KEY("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","startedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY("organizationId","completedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK(("startedAt" IS NULL)=("startedByUserId" IS NULL)),
 CHECK(("completedAt" IS NULL)=("completedByUserId" IS NULL)),
 CHECK("updatedAt">="createdAt" AND ("startedAt" IS NULL OR "startedAt">="createdAt")
  AND ("completedAt" IS NULL OR ("startedAt" IS NOT NULL AND "completedAt">="startedAt"))
  AND ("cancelledAt" IS NULL OR "cancelledAt">="createdAt")),
 CHECK((status='WAITING' AND "startedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  OR (status='PACKING' AND "startedAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  OR (status='READY' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL)
  OR (status='CANCELLED' AND "cancelledAt" IS NOT NULL))
);
CREATE INDEX packing_session_board ON "PackingSession"("organizationId","locationId",status,"createdAt",id);
CREATE TABLE "PackingItem" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL, "sessionId" uuid NOT NULL, "ticketId" uuid NOT NULL,
 "ticketItemId" uuid NOT NULL, checked boolean NOT NULL DEFAULT false,
 "checkedAt" timestamptz(3), "checkedByUserId" uuid,
 UNIQUE("organizationId","locationId","sessionId",id),
 UNIQUE("organizationId","sessionId","ticketItemId"),
 FOREIGN KEY("organizationId","locationId","ticketId","sessionId")
  REFERENCES "PackingSession"("organizationId","locationId","ticketId",id),
 FOREIGN KEY("organizationId","locationId","ticketId","ticketItemId")
  REFERENCES "KitchenTicketItem"("organizationId","locationId","ticketId",id),
 FOREIGN KEY("organizationId","checkedByUserId") REFERENCES "CompanyUser"("organizationId",id),
 CHECK(("checkedAt" IS NULL)=("checkedByUserId" IS NULL)),
 CHECK(NOT checked OR "checkedAt" IS NOT NULL)
);
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['PackingSession','PackingItem'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',rel);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',rel);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',rel);
 END LOOP;
END $$;
GRANT UPDATE(status,version,"updatedByUserId","updatedAt","cancelledAt") ON "PackingSession" TO pos_runtime;

CREATE FUNCTION public.protect_packing_session() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; parent public."Order"; parent_xmin xid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'packing sessions cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."ticketId";
  IF ticket.id IS NULL OR ticket."generationTransaction" IS DISTINCT FROM txid_current()
   OR ticket.status<>'QUEUED' OR NEW.status<>'WAITING' OR NEW.version<>1
   OR NEW."startedAt" IS NOT NULL OR NEW."completedAt" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL
   OR NEW."startedByUserId" IS NOT NULL OR NEW."completedByUserId" IS NOT NULL THEN
   RAISE EXCEPTION 'packing session requires atomic initial kitchen generation' USING ERRCODE='23514'; END IF;
  NEW."createdByUserId":=ticket."sentByUserId"; NEW."updatedByUserId":=ticket."sentByUserId";
  NEW."createdAt":=ticket."createdAt"; NEW."updatedAt":=ticket."createdAt";
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
CREATE TRIGGER packing_session_protection BEFORE INSERT OR UPDATE OR DELETE ON "PackingSession"
 FOR EACH ROW EXECUTE FUNCTION public.protect_packing_session();

CREATE FUNCTION public.validate_packing_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket public."KitchenTicket"; session public."PackingSession";
BEGIN
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."ticketId";
 SELECT * INTO session FROM public."PackingSession" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId" AND id=NEW."sessionId";
 IF ticket.id IS NULL OR ticket."generationTransaction" IS DISTINCT FROM txid_current()
  OR session.id IS NULL OR session.status<>'WAITING' OR session.version<>1
  OR NEW.checked OR NEW."checkedAt" IS NOT NULL OR NEW."checkedByUserId" IS NOT NULL THEN
  RAISE EXCEPTION 'packing checklist requires its atomic kitchen snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER packing_item_validation BEFORE INSERT ON "PackingItem"
 FOR EACH ROW EXECUTE FUNCTION public.validate_packing_item();
CREATE TRIGGER packing_item_immutable BEFORE UPDATE OR DELETE ON "PackingItem"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.generate_packing_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE session_id uuid;
BEGIN
 IF TG_TABLE_NAME='KitchenTicket' THEN
  INSERT INTO public."PackingSession"("organizationId","locationId","orderId","ticketId","createdByUserId","updatedByUserId")
   VALUES(NEW."organizationId",NEW."locationId",NEW."orderId",NEW.id,NEW."sentByUserId",NEW."sentByUserId");
 ELSE
  SELECT id INTO session_id FROM public."PackingSession" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND "ticketId"=NEW."ticketId";
  INSERT INTO public."PackingItem"("organizationId","locationId","sessionId","ticketId","ticketItemId")
   VALUES(NEW."organizationId",NEW."locationId",session_id,NEW."ticketId",NEW.id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER packing_session_generation AFTER INSERT ON "KitchenTicket"
 FOR EACH ROW EXECUTE FUNCTION public.generate_packing_snapshot();
CREATE TRIGGER packing_item_generation AFTER INSERT ON "KitchenTicketItem"
 FOR EACH ROW EXECUTE FUNCTION public.generate_packing_snapshot();

CREATE FUNCTION public.check_packing_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE row_data jsonb; org_id uuid; ticket_id uuid; ticket public."KitchenTicket";
 session public."PackingSession"; item_count bigint; packing_count bigint; order_status text;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 org_id:=(row_data->>'organizationId')::uuid;
 ticket_id:=CASE WHEN TG_TABLE_NAME='KitchenTicket' THEN (row_data->>'id')::uuid ELSE (row_data->>'ticketId')::uuid END;
 SELECT * INTO ticket FROM public."KitchenTicket" WHERE "organizationId"=org_id AND id=ticket_id;
 SELECT * INTO session FROM public."PackingSession" WHERE "organizationId"=org_id AND "ticketId"=ticket_id;
 IF session.id IS NULL THEN
  IF ticket."generationTransaction"=txid_current() THEN
   RAISE EXCEPTION 'new kitchen snapshot requires packing session' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT count(*) INTO item_count FROM public."KitchenTicketItem" WHERE "organizationId"=org_id AND "ticketId"=ticket_id;
 SELECT count(*) INTO packing_count FROM public."PackingItem" WHERE "organizationId"=org_id AND "sessionId"=session.id;
 SELECT status INTO order_status FROM public."Order" WHERE "organizationId"=org_id AND id=session."orderId";
 IF item_count=0 OR item_count<>packing_count OR ((session.status='CANCELLED')<>(order_status='CANCELLED')) THEN
  RAISE EXCEPTION 'packing snapshot must be complete and consistent with order' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicket','KitchenTicketItem','PackingSession','PackingItem'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER packing_snapshot_complete AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_packing_snapshot()',rel);
 END LOOP;
END $$;
CREATE FUNCTION public.cancel_order_packing() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' THEN
  UPDATE public."PackingSession" SET status='CANCELLED',version=version+1,"updatedByUserId"=NEW."updatedByUserId"
   WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW.id AND status<>'CANCELLED';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER order_packing_cancellation AFTER UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.cancel_order_packing();
REVOKE ALL ON FUNCTION public.protect_packing_session(),public.validate_packing_item(),public.generate_packing_snapshot(),
 public.check_packing_snapshot(),public.cancel_order_packing() FROM PUBLIC;
COMMIT;
