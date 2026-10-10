-- DEV093: explicit order responsibility and nominal shift handoff.
-- Additive; reviewed existing financial branches and historical data remain unchanged.
BEGIN;
-- Additive parent exactness key; no row rewriting or timeline events fabricated.
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT order_event_responsibility_source
 UNIQUE ("organizationId","locationId","orderId",id);
ALTER TABLE "CashShift" ADD CONSTRAINT cash_shift_responsibility_source
 UNIQUE ("organizationId","locationId","registerId",id);

ALTER TABLE "Checkout" ADD CONSTRAINT checkout_responsibility_source
 UNIQUE ("organizationId","locationId","orderId",id);

CREATE TABLE "OrderResponsibilityGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>=1),
 PRIMARY KEY ("organizationId","orderId"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id)
);
-- Gate is technical serialization only: identity immutable, INSERT1, UPDATE revision+1, noDELETE.
-- Every NEW relevant payment/checkout/cancel and manual responsibility command advances it
-- after Order FOR UPDATE, before reading responsibility; historical replay never writes it.

CREATE TABLE "OrderResponsibilityEvent" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 version integer NOT NULL CHECK (version>0), "previousVersion" integer NOT NULL CHECK ("previousVersion">=0),
 kind text NOT NULL CHECK (kind IN ('ASSIGN','PREPARE_HANDOFF','ACCEPT_HANDOFF','RESOLVED_PAID','RESOLVED_CANCELLED','RESOLVED_DEMO','REOPENED_UNASSIGNED')),
 "actorUserId" uuid NOT NULL, "actorDisplayName" text NOT NULL,
 "orderVersion" integer NOT NULL CHECK ("orderVersion">0), "orderNumber" integer NOT NULL,
 "orderTotal" numeric(18,2) NOT NULL, "outstandingSnapshot" numeric NOT NULL,
 "previousState" text NOT NULL, "resultState" text NOT NULL,
 "fromOwnerUserId" uuid, "fromOwnerName" text, "toOwnerUserId" uuid, "toOwnerName" text,
 "sourceShiftId" uuid, "targetShiftId" uuid, "registerId" uuid,
 "registerCode" text, "registerName" text,
 "handoffEventId" uuid, reason text, "managerReason" text,
 "requestKey" uuid, "sourceOrderEventId" uuid, "paymentOperationId" uuid, "checkoutId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (version="previousVersion"+1),
 CHECK ("orderTotal">=0 AND "orderTotal"<'Infinity'::numeric
   AND "outstandingSnapshot">=0 AND "outstandingSnapshot"<'Infinity'::numeric),
 CHECK ((kind IN ('ASSIGN','PREPARE_HANDOFF','ACCEPT_HANDOFF') AND "requestKey" IS NOT NULL
   AND "sourceOrderEventId" IS NULL AND "paymentOperationId" IS NULL AND "checkoutId" IS NULL
   AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 3 AND 500)
  OR (kind IN ('RESOLVED_PAID','RESOLVED_CANCELLED','RESOLVED_DEMO','REOPENED_UNASSIGNED')
   AND "requestKey" IS NULL AND "sourceOrderEventId" IS NOT NULL AND reason IS NULL AND "managerReason" IS NULL)),
 CHECK ("managerReason" IS NULL OR (kind='PREPARE_HANDOFF' AND length(btrim("managerReason")) BETWEEN 3 AND 500)),
 UNIQUE ("organizationId","locationId","orderId",id),
 UNIQUE ("organizationId","orderId",version),
 UNIQUE ("organizationId","locationId","requestKey"),
 UNIQUE ("organizationId","sourceOrderEventId"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","fromOwnerUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","toOwnerUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId","sourceShiftId") REFERENCES "CashShift"("organizationId","locationId","registerId",id),
 FOREIGN KEY ("organizationId","locationId","registerId","targetShiftId") REFERENCES "CashShift"("organizationId","locationId","registerId",id),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","handoffEventId") REFERENCES "OrderResponsibilityEvent"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","sourceOrderEventId") REFERENCES "OrderStatusEvent"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","paymentOperationId") REFERENCES "PaymentOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","checkoutId") REFERENCES "Checkout"("organizationId","locationId","orderId",id)
);
-- Event validator below derives scoped source identity and immutable snapshots.
-- Derived RESOLVED clears current owner/shift but snapshots retain the previous nominal owner.

CREATE TABLE "OrderResponsibility" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 state text NOT NULL CHECK (state IN ('ASSIGNED','PENDING_HANDOFF','RESOLVED','UNASSIGNED')),
 version integer NOT NULL CHECK (version>0), "lastEventId" uuid NOT NULL,
 "ownerUserId" uuid, "ownerDisplayName" text, "shiftId" uuid, "registerId" uuid,
 "registerCode" text, "registerName" text, "pendingEventId" uuid,
 PRIMARY KEY ("organizationId","orderId"),
 CHECK ((state IN ('ASSIGNED','PENDING_HANDOFF') AND "ownerUserId" IS NOT NULL AND "ownerDisplayName" IS NOT NULL
   AND "shiftId" IS NOT NULL AND "registerId" IS NOT NULL AND "registerCode" IS NOT NULL AND "registerName" IS NOT NULL)
  OR (state IN ('RESOLVED','UNASSIGNED') AND "ownerUserId" IS NULL AND "ownerDisplayName" IS NULL
   AND "shiftId" IS NULL AND "registerId" IS NULL AND "registerCode" IS NULL AND "registerName" IS NULL)),
 CHECK ((state='PENDING_HANDOFF')=("pendingEventId" IS NOT NULL)),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","ownerUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId","shiftId") REFERENCES "CashShift"("organizationId","locationId","registerId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","lastEventId") REFERENCES "OrderResponsibilityEvent"("organizationId","locationId","orderId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("organizationId","locationId","orderId","pendingEventId") REFERENCES "OrderResponsibilityEvent"("organizationId","locationId","orderId",id)
);

CREATE TABLE "OrderResponsibilityCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('ASSIGN','PREPARE_HANDOFF','ACCEPT_HANDOFF')),
 "sourceShiftId" uuid, "targetShiftId" uuid, "handoffEventId" uuid,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "requestHash" text, "resultEventId" uuid, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId","requestKey"),
 UNIQUE ("organizationId","resultEventId"),
 CHECK ((kind='ASSIGN' AND "targetShiftId" IS NOT NULL AND "sourceShiftId" IS NULL AND "handoffEventId" IS NULL)
  OR (kind='PREPARE_HANDOFF' AND "sourceShiftId" IS NOT NULL AND "targetShiftId" IS NULL AND "handoffEventId" IS NULL)
  OR (kind='ACCEPT_HANDOFF' AND "targetShiftId" IS NOT NULL AND "sourceShiftId" IS NULL AND "handoffEventId" IS NOT NULL)),
 CHECK ((status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash"~'^[0-9a-f]{64}$' AND "resultEventId" IS NOT NULL)
  OR (status='RETIRED' AND "requestHash" IS NULL AND "resultEventId" IS NULL)),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","sourceShiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","targetShiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","handoffEventId") REFERENCES "OrderResponsibilityEvent"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","resultEventId") REFERENCES "OrderResponsibilityEvent"("organizationId","locationId","orderId",id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE "OrderResponsibilityEvent" ADD CONSTRAINT responsibility_manual_command_fk
 FOREIGN KEY ("organizationId","locationId","requestKey") REFERENCES "OrderResponsibilityCommand"("organizationId","locationId","requestKey") DEFERRABLE INITIALLY DEFERRED;

-- Narrow queue indexes match the authorized scoped views; no aggregate access implied.
CREATE INDEX responsibility_shift_queue ON "OrderResponsibility"("organizationId","locationId","shiftId",state,"orderId");
CREATE INDEX responsibility_pending_register ON "OrderResponsibility"("organizationId","locationId","registerId","orderId") WHERE state='PENDING_HANDOFF';
CREATE INDEX responsibility_event_history ON "OrderResponsibilityEvent"("organizationId","locationId","orderId","createdAt",id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['OrderResponsibilityGate','OrderResponsibility','OrderResponsibilityEvent','OrderResponsibilityCommand'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',t);
  IF t IN ('OrderResponsibilityEvent','OrderResponsibilityCommand') THEN
   EXECUTE format('CREATE TRIGGER responsibility_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE (revision) ON "OrderResponsibilityGate" TO pos_runtime;
GRANT UPDATE (state,version,"lastEventId","ownerUserId","ownerDisplayName","shiftId","registerId","registerCode","registerName","pendingEventId") ON "OrderResponsibility" TO pos_runtime;

CREATE FUNCTION public.protect_order_responsibility_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'order responsibility gate is permanent' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'order responsibility gate starts at one' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.revision<>OLD.revision+1 OR (NEW."organizationId",NEW."locationId",NEW."orderId") IS DISTINCT FROM (OLD."organizationId",OLD."locationId",OLD."orderId") THEN
   RAISE EXCEPTION 'order responsibility gate identity and revision are protected' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER responsibility_gate_validation BEFORE INSERT OR UPDATE OR DELETE ON "OrderResponsibilityGate"
 FOR EACH ROW EXECUTE FUNCTION public.protect_order_responsibility_gate();

-- Caller holds Order. Every NEW relevant writer writes this mutex even when no projection exists.
-- No txid/xmin comparison and no transaction-local client flag is an authority.
CREATE FUNCTION public.prepare_order_responsibility(org uuid,loc uuid,order_id uuid,extra_shifts uuid[] DEFAULT ARRAY[]::uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE shift_ids uuid[]; register_ids uuid[]; shift_id uuid; reg uuid; nominal uuid;
BEGIN
 PERFORM id FROM public."Order" WHERE "organizationId"=org AND "locationId"=loc AND id=order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'responsibility requires its scoped order' USING ERRCODE='23514'; END IF;
 INSERT INTO public."OrderResponsibilityGate"("organizationId","locationId","orderId") VALUES(org,loc,order_id)
 ON CONFLICT ("organizationId","orderId") DO UPDATE SET revision="OrderResponsibilityGate".revision+1;
 SELECT "shiftId" INTO nominal FROM public."OrderResponsibility" WHERE "organizationId"=org AND "locationId"=loc AND "orderId"=order_id;
 SELECT coalesce(array_agg(DISTINCT v ORDER BY v),ARRAY[]::uuid[]) INTO shift_ids FROM unnest(extra_shifts||ARRAY[nominal]) v WHERE v IS NOT NULL;
 IF cardinality(shift_ids)=0 THEN RETURN; END IF;
 IF (SELECT count(*) FROM public."CashShift" WHERE "organizationId"=org AND "locationId"=loc AND id=ANY(shift_ids))<>cardinality(shift_ids) THEN
  RAISE EXCEPTION 'responsibility shift scope mismatch' USING ERRCODE='23514'; END IF;
 SELECT array_agg(DISTINCT "registerId" ORDER BY "registerId") INTO register_ids FROM public."CashShift"
  WHERE "organizationId"=org AND "locationId"=loc AND id=ANY(shift_ids);
 -- NO KEY UPDATE is compatible with the late CashOperation FK KEY SHARE held by cash-only writers.
 FOREACH reg IN ARRAY register_ids LOOP
  PERFORM id FROM public."CashRegister" WHERE "organizationId"=org AND "locationId"=loc AND id=reg FOR NO KEY UPDATE;
 END LOOP;
 FOREACH reg IN ARRAY register_ids LOOP PERFORM public.advance_cash_register_gate(org,loc,reg); END LOOP;
 FOREACH shift_id IN ARRAY shift_ids LOOP
  PERFORM id FROM public."CashShift" WHERE "organizationId"=org AND "locationId"=loc AND id=shift_id FOR UPDATE;
 END LOOP;
END $$;

CREATE FUNCTION public.prepare_responsibility_financial_header() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE nominal uuid;
BEGIN
 -- Old guards already locked Order. Read only AFTER the order mutex generation advances.
 -- Include payout even without ownership: this keeps concurrent A->B/B->A lock sets deterministic.
 PERFORM public.prepare_order_responsibility(NEW."organizationId",NEW."locationId",NEW."orderId",ARRAY[NEW."cashShiftId"]);
 RETURN NEW;
END $$;
CREATE TRIGGER y_responsibility_payment_header BEFORE INSERT ON "PaymentOperation"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_responsibility_financial_header();
CREATE TRIGGER y_responsibility_checkout_header BEFORE INSERT ON "Checkout"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_responsibility_financial_header();

CREATE FUNCTION public.prepare_responsibility_cancellation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
  PERFORM public.prepare_order_responsibility(NEW."organizationId",NEW."locationId",NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER y_responsibility_cancellation BEFORE UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_responsibility_cancellation();

-- All event metadata comes from its real source, current order and previous projection.
-- Manual callers supply only intent, optimistic versions, key and reasons. Snapshots are derived.
CREATE FUNCTION public.validate_order_responsibility_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; p public."OrderResponsibility"; source_shift public."CashShift"; target_shift public."CashShift";
 source_event public."OrderStatusEvent"; op public."PaymentOperation"; checkout public."Checkout";
 pending public."OrderResponsibilityEvent"; outstanding numeric; is_manual boolean; eligible boolean;
BEGIN
 is_manual:=NEW.kind IN ('ASSIGN','PREPARE_HANDOFF','ACCEPT_HANDOFF');
 PERFORM public.prepare_order_responsibility(NEW."organizationId",NEW."locationId",NEW."orderId",ARRAY[NEW."sourceShiftId",NEW."targetShiftId"]);
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 SELECT * INTO p FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId";
 outstanding:=greatest(o.total-public.order_net_paid(o."organizationId",o.id),0);
 eligible:=o.status NOT IN ('DRAFT','CANCELLED') AND outstanding>0 AND NOT EXISTS (
  SELECT 1 FROM public."Checkout" WHERE "organizationId"=o."organizationId" AND "orderId"=o.id AND mode='DEMO');
 IF NEW."previousVersion" IS DISTINCT FROM coalesce(p.version,0) OR NEW.version IS DISTINCT FROM coalesce(p.version,0)+1
  OR NEW."orderVersion" IS DISTINCT FROM o.version THEN
  RAISE EXCEPTION 'responsibility requires current order and responsibility versions' USING ERRCODE='23514'; END IF;
 NEW."previousState":=coalesce(p.state,'UNASSIGNED');
 NEW."orderNumber":=o.number; NEW."orderTotal":=o.total; NEW."outstandingSnapshot":=outstanding;
 NEW."fromOwnerUserId":=p."ownerUserId"; NEW."fromOwnerName":=p."ownerDisplayName";
 NEW."toOwnerUserId":=NULL; NEW."toOwnerName":=NULL;
 IF is_manual THEN
  IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
   RAISE EXCEPTION 'responsibility command requires current scoped actor' USING ERRCODE='23514'; END IF;
  IF NOT eligible THEN RAISE EXCEPTION 'order is not eligible for responsibility' USING ERRCODE='23514'; END IF;
  IF NEW.kind='ASSIGN' THEN
   IF coalesce(p.state,'UNASSIGNED')<>'UNASSIGNED' OR NEW."sourceShiftId" IS NOT NULL OR NEW."handoffEventId" IS NOT NULL OR NEW."managerReason" IS NOT NULL THEN
    RAISE EXCEPTION 'assignment requires an unassigned order' USING ERRCODE='23514'; END IF;
   SELECT * INTO target_shift FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."targetShiftId";
   IF target_shift.id IS NULL OR target_shift.status<>'OPEN' OR target_shift."ownerUserId" IS DISTINCT FROM NEW."actorUserId" THEN
    RAISE EXCEPTION 'assignment requires own open shift' USING ERRCODE='23514'; END IF;
   NEW."resultState":='ASSIGNED';
  ELSIF NEW.kind='PREPARE_HANDOFF' THEN
   IF p.state IS DISTINCT FROM 'ASSIGNED' OR NEW."sourceShiftId" IS DISTINCT FROM p."shiftId" OR NEW."targetShiftId" IS NOT NULL OR NEW."handoffEventId" IS NOT NULL THEN
    RAISE EXCEPTION 'handoff preparation requires exact assigned source' USING ERRCODE='23514'; END IF;
   SELECT * INTO source_shift FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=p."shiftId";
   IF source_shift.status IS DISTINCT FROM 'OPEN' OR source_shift."ownerUserId" IS DISTINCT FROM p."ownerUserId"
    OR (NEW."actorUserId"=p."ownerUserId" AND NEW."managerReason" IS NOT NULL)
    OR (NEW."actorUserId"<>p."ownerUserId" AND (NEW."managerReason" IS NULL OR length(btrim(NEW."managerReason")) NOT BETWEEN 3 AND 500)) THEN
    RAISE EXCEPTION 'handoff preparation requires open source and explicit managerial reason for another owner' USING ERRCODE='23514'; END IF;
   NEW."resultState":='PENDING_HANDOFF'; NEW."toOwnerUserId":=p."ownerUserId"; NEW."toOwnerName":=p."ownerDisplayName";
  ELSE
   IF p.state IS DISTINCT FROM 'PENDING_HANDOFF' OR NEW."handoffEventId" IS DISTINCT FROM p."pendingEventId" OR NEW."managerReason" IS NOT NULL THEN
    RAISE EXCEPTION 'accept requires the exact pending handoff' USING ERRCODE='23514'; END IF;
   SELECT * INTO pending FROM public."OrderResponsibilityEvent" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."handoffEventId";
   SELECT * INTO source_shift FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=p."shiftId";
   SELECT * INTO target_shift FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."targetShiftId";
   IF pending.kind IS DISTINCT FROM 'PREPARE_HANDOFF' OR source_shift.status IS DISTINCT FROM 'CLOSED' OR target_shift.status IS DISTINCT FROM 'OPEN'
    OR target_shift.id=source_shift.id OR target_shift."registerId" IS DISTINCT FROM p."registerId" OR target_shift."ownerUserId" IS DISTINCT FROM NEW."actorUserId" THEN
    RAISE EXCEPTION 'accept requires distinct own open successor on the same register' USING ERRCODE='23514'; END IF;
   NEW."sourceShiftId":=p."shiftId"; NEW."resultState":='ASSIGNED';
  END IF;
 ELSE
  IF p."orderId" IS NULL THEN RAISE EXCEPTION 'derived responsibility requires previous explicit history' USING ERRCODE='23514'; END IF;
  SELECT * INTO source_event FROM public."OrderStatusEvent" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."sourceOrderEventId";
  IF source_event.id IS NULL OR source_event."orderVersion" IS DISTINCT FROM o.version THEN
   RAISE EXCEPTION 'derived responsibility requires exact current commercial source' USING ERRCODE='23514'; END IF;
  NEW."actorUserId":=source_event."actorUserId";
  NEW."sourceShiftId":=p."shiftId"; NEW."targetShiftId":=NULL; NEW."handoffEventId":=NULL;
  IF source_event.kind='PAYMENT' THEN
   SELECT * INTO op FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND "requestKey"=source_event."requestKey";
   IF op.id IS NULL OR op."orderVersion" IS DISTINCT FROM source_event."orderVersion" OR op."actorUserId" IS DISTINCT FROM source_event."actorUserId" THEN
    RAISE EXCEPTION 'responsibility payment source mismatch' USING ERRCODE='23514'; END IF;
   NEW."paymentOperationId":=op.id; NEW."checkoutId":=NULL;
  ELSE
   NEW."paymentOperationId":=NULL; NEW."checkoutId":=NULL;
   IF source_event.kind='ORDER' AND source_event."toStatus"='COMPLETED' THEN
    SELECT * INTO checkout FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId";
    IF checkout.id IS NOT NULL AND checkout."createdByUserId" IS DISTINCT FROM source_event."actorUserId" THEN
     RAISE EXCEPTION 'responsibility checkout actor mismatch' USING ERRCODE='23514'; END IF;
    NEW."checkoutId":=checkout.id;
   END IF;
  END IF;
  IF NEW.kind='REOPENED_UNASSIGNED' THEN
   IF p.state<>'RESOLVED' OR NOT eligible OR op.kind IS DISTINCT FROM 'REFUND' THEN
    RAISE EXCEPTION 'reopening requires a real refund that recreates outstanding debt' USING ERRCODE='23514'; END IF;
   NEW."resultState":='UNASSIGNED';
  ELSE
   IF p.state NOT IN ('ASSIGNED','PENDING_HANDOFF') THEN RAISE EXCEPTION 'resolution requires an active responsibility' USING ERRCODE='23514'; END IF;
   IF NEW.kind='RESOLVED_PAID' THEN
    IF outstanding<>0 OR ((source_event.kind='PAYMENT' AND op.kind='COLLECT') OR (source_event.kind='ORDER' AND source_event."toStatus"='COMPLETED' AND checkout.mode='MANUAL')) IS DISTINCT FROM TRUE THEN
     RAISE EXCEPTION 'paid resolution requires actual full collection' USING ERRCODE='23514'; END IF;
   ELSIF NEW.kind='RESOLVED_CANCELLED' THEN
    IF source_event.kind<>'ORDER' OR source_event."toStatus"<>'CANCELLED' OR o.status<>'CANCELLED' THEN
     RAISE EXCEPTION 'cancelled resolution requires actual cancellation' USING ERRCODE='23514'; END IF;
   ELSIF NEW.kind='RESOLVED_DEMO' THEN
    IF source_event.kind<>'ORDER' OR source_event."toStatus"<>'COMPLETED' OR checkout.mode IS DISTINCT FROM 'DEMO' THEN
     RAISE EXCEPTION 'demo resolution requires the exact demo checkout' USING ERRCODE='23514'; END IF;
   ELSE RAISE EXCEPTION 'unknown derived responsibility kind' USING ERRCODE='23514'; END IF;
   NEW."resultState":='RESOLVED';
  END IF;
 END IF;
 IF target_shift.id IS NOT NULL THEN
  NEW."toOwnerUserId":=target_shift."ownerUserId"; NEW."toOwnerName":=target_shift."ownerDisplayName";
  NEW."registerId":=target_shift."registerId"; NEW."registerCode":=target_shift."registerCode"; NEW."registerName":=target_shift."registerName";
 ELSE
  NEW."registerId":=p."registerId"; NEW."registerCode":=p."registerCode"; NEW."registerName":=p."registerName";
 END IF;
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 IF NEW."actorDisplayName" IS NULL THEN RAISE EXCEPTION 'responsibility actor requires scoped identity' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER responsibility_event_validation BEFORE INSERT ON "OrderResponsibilityEvent"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_responsibility_event();

CREATE FUNCTION public.responsibility_projection(e public."OrderResponsibilityEvent") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('organizationId',e."organizationId",'locationId',e."locationId",'orderId',e."orderId",
  'state',e."resultState",'version',e.version,'lastEventId',e.id,
  'ownerUserId',CASE WHEN e."resultState" IN ('ASSIGNED','PENDING_HANDOFF') THEN e."toOwnerUserId" END,
  'ownerDisplayName',CASE WHEN e."resultState" IN ('ASSIGNED','PENDING_HANDOFF') THEN e."toOwnerName" END,
  'shiftId',CASE WHEN e."resultState"='ASSIGNED' THEN e."targetShiftId" WHEN e."resultState"='PENDING_HANDOFF' THEN e."sourceShiftId" END,
  'registerId',CASE WHEN e."resultState" IN ('ASSIGNED','PENDING_HANDOFF') THEN e."registerId" END,
  'registerCode',CASE WHEN e."resultState" IN ('ASSIGNED','PENDING_HANDOFF') THEN e."registerCode" END,
  'registerName',CASE WHEN e."resultState" IN ('ASSIGNED','PENDING_HANDOFF') THEN e."registerName" END,
  'pendingEventId',CASE WHEN e."resultState"='PENDING_HANDOFF' THEN e.id END)
$$;

CREATE FUNCTION public.protect_order_responsibility() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e public."OrderResponsibilityEvent";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'responsibility history cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM public."OrderResponsibilityEvent" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND id=NEW."lastEventId";
 IF e.id IS NULL OR to_jsonb(NEW) IS DISTINCT FROM public.responsibility_projection(e)
  OR (TG_OP='INSERT' AND (NEW.version<>1 OR e."previousVersion"<>0)) THEN
  RAISE EXCEPTION 'responsibility projection requires its exact event snapshot' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW."organizationId",NEW."locationId",NEW."orderId") IS DISTINCT FROM (OLD."organizationId",OLD."locationId",OLD."orderId")
  OR NEW.version<>OLD.version+1 OR e."previousVersion"<>OLD.version OR e."previousState"<>OLD.state) THEN
  RAISE EXCEPTION 'responsibility projection requires monotone event transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER responsibility_projection_validation BEFORE INSERT OR UPDATE OR DELETE ON "OrderResponsibility"
 FOR EACH ROW EXECUTE FUNCTION public.protect_order_responsibility();

CREATE FUNCTION public.apply_order_responsibility_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."OrderResponsibility";
BEGIN
 SELECT * INTO p FROM jsonb_populate_record(NULL::public."OrderResponsibility",public.responsibility_projection(NEW));
 UPDATE public."OrderResponsibility" SET
  state=p.state,version=p.version,"lastEventId"=p."lastEventId",
  "ownerUserId"=p."ownerUserId","ownerDisplayName"=p."ownerDisplayName","shiftId"=p."shiftId",
  "registerId"=p."registerId","registerCode"=p."registerCode","registerName"=p."registerName","pendingEventId"=p."pendingEventId"
 WHERE "organizationId"=p."organizationId" AND "orderId"=p."orderId";
 IF NOT FOUND THEN INSERT INTO public."OrderResponsibility" SELECT p.*; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER responsibility_event_projection AFTER INSERT ON "OrderResponsibilityEvent"
 FOR EACH ROW EXECUTE FUNCTION public.apply_order_responsibility_event();

CREATE FUNCTION public.check_order_responsibility_effect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."OrderResponsibility"; e public."OrderResponsibilityEvent";
BEGIN
 SELECT * INTO p FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId";
 -- Every insertion validated the exact previous projection under Order lock.
 -- At commit, multiple legitimate events in one transaction must point to the latest event.
 SELECT * INTO e FROM public."OrderResponsibilityEvent"
 WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId"
 ORDER BY version DESC LIMIT 1;
 IF e.id IS NULL OR p."orderId" IS NULL OR to_jsonb(p) IS DISTINCT FROM public.responsibility_projection(e) THEN
  RAISE EXCEPTION 'responsibility event and exact projection must commit together' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER responsibility_event_effect AFTER INSERT ON "OrderResponsibilityEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_responsibility_effect();
CREATE CONSTRAINT TRIGGER responsibility_projection_effect AFTER INSERT OR UPDATE ON "OrderResponsibility"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_responsibility_effect();

CREATE FUNCTION public.validate_order_responsibility_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'responsibility claim requires current scoped actor' USING ERRCODE='23514'; END IF;
 -- Acquire the Order lock before command FKs can take KEY SHARE, for both statuses.
 -- Otherwise two new SUCCEEDED claims could deadlock when their events upgrade Order later.
 PERFORM public.prepare_order_responsibility(NEW."organizationId",NEW."locationId",NEW."orderId",ARRAY[NEW."sourceShiftId",NEW."targetShiftId"]);
 IF NEW.status='RETIRED' THEN
  IF EXISTS (SELECT 1 FROM public."OrderResponsibilityEvent" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey") THEN
   RAISE EXCEPTION 'cannot retire an existing responsibility effect' USING ERRCODE='23514'; END IF;
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER responsibility_command_validation BEFORE INSERT ON "OrderResponsibilityCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_responsibility_command();

CREATE FUNCTION public.check_order_responsibility_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public."OrderResponsibilityCommand"; e public."OrderResponsibilityEvent";
BEGIN
 IF TG_TABLE_NAME='OrderResponsibilityEvent' THEN
  IF NEW."requestKey" IS NULL THEN RETURN NULL; END IF;
  e:=NEW;
  SELECT * INTO c FROM public."OrderResponsibilityCommand" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 ELSE
  c:=NEW;
  IF c.status='RETIRED' THEN
   IF EXISTS (SELECT 1 FROM public."OrderResponsibilityEvent" WHERE "organizationId"=c."organizationId" AND "locationId"=c."locationId" AND "requestKey"=c."requestKey") THEN
    RAISE EXCEPTION 'retired responsibility key cannot have an effect' USING ERRCODE='23514'; END IF;
   RETURN NULL;
  END IF;
  SELECT * INTO e FROM public."OrderResponsibilityEvent" WHERE "organizationId"=c."organizationId" AND "locationId"=c."locationId" AND "orderId"=c."orderId" AND id=c."resultEventId";
 END IF;
 IF c.id IS NULL OR e.id IS NULL OR c.status<>'SUCCEEDED'
  OR (c."organizationId",c."locationId",c."orderId",c."actorUserId",c.kind,c."requestKey",c."resultEventId",c."sourceShiftId",c."targetShiftId",c."handoffEventId")
  IS DISTINCT FROM (e."organizationId",e."locationId",e."orderId",e."actorUserId",e.kind,e."requestKey",e.id,
   CASE WHEN e.kind='PREPARE_HANDOFF' THEN e."sourceShiftId" END,e."targetShiftId",e."handoffEventId") THEN
  RAISE EXCEPTION 'responsibility command requires its exact immutable effect identity' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER responsibility_command_effect AFTER INSERT ON "OrderResponsibilityCommand"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_responsibility_command();
CREATE CONSTRAINT TRIGGER responsibility_event_command AFTER INSERT ON "OrderResponsibilityEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_responsibility_command();

CREATE FUNCTION public.derive_order_responsibility() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."OrderResponsibility"; o public."Order"; op public."PaymentOperation"; checkout public."Checkout"; event_kind text; outstanding numeric;
BEGIN
 IF NOT (NEW.kind='PAYMENT' OR (NEW.kind='ORDER' AND NEW."toStatus" IN ('CANCELLED','COMPLETED'))) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId";
 IF p."orderId" IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 outstanding:=greatest(o.total-public.order_net_paid(o."organizationId",o.id),0);
 IF NEW.kind='PAYMENT' THEN
  SELECT * INTO op FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId" AND "requestKey"=NEW."requestKey";
 ELSE
  SELECT * INTO checkout FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "orderId"=NEW."orderId";
 END IF;
 IF p.state IN ('ASSIGNED','PENDING_HANDOFF') THEN
  IF NEW.kind='ORDER' AND NEW."toStatus"='CANCELLED' THEN event_kind:='RESOLVED_CANCELLED';
  ELSIF NEW.kind='ORDER' AND NEW."toStatus"='COMPLETED' AND checkout.mode='DEMO' THEN event_kind:='RESOLVED_DEMO';
  ELSIF outstanding=0 AND ((NEW.kind='PAYMENT' AND op.kind='COLLECT') OR (NEW.kind='ORDER' AND NEW."toStatus"='COMPLETED' AND checkout.mode='MANUAL')) THEN event_kind:='RESOLVED_PAID';
  END IF;
 ELSIF p.state='RESOLVED' AND outstanding>0 AND op.kind='REFUND' AND o.status NOT IN ('DRAFT','CANCELLED') THEN event_kind:='REOPENED_UNASSIGNED';
 END IF;
 IF event_kind IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public."OrderResponsibilityEvent"(id,"organizationId","locationId","orderId",version,"previousVersion",kind,"actorUserId","orderVersion","sourceOrderEventId")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."orderId",p.version+1,p.version,event_kind,NEW."actorUserId",o.version,NEW.id);
 RETURN NULL;
END $$;
CREATE TRIGGER responsibility_from_commercial_event AFTER INSERT ON "OrderStatusEvent"
 FOR EACH ROW EXECUTE FUNCTION public.derive_order_responsibility();

-- This deferred source guard detects skipped/late derivation even when the old commercial
-- consistency guard is the first to reject an incomplete transaction. No fabricated source rows.
CREATE FUNCTION public.check_order_responsibility_business_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."OrderResponsibility"; o public."Order"; eligible boolean;
BEGIN
 SELECT * INTO p FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id;
 IF p."orderId" IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 eligible:=o.status NOT IN ('DRAFT','CANCELLED') AND o.total-public.order_net_paid(o."organizationId",o.id)>0 AND NOT EXISTS (
  SELECT 1 FROM public."Checkout" WHERE "organizationId"=o."organizationId" AND "orderId"=o.id AND mode='DEMO');
 IF (p.state IN ('ASSIGNED','PENDING_HANDOFF') AND NOT eligible) OR (p.state='RESOLVED' AND eligible) THEN
  RAISE EXCEPTION 'responsibility must reflect its real terminal or refunded order source' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER responsibility_business_effect AFTER UPDATE ON "Order"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_responsibility_business_state();

CREATE FUNCTION public.prepare_responsibility_close(org uuid,loc uuid,shift_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE reg uuid;
BEGIN
 SELECT "registerId" INTO reg FROM public."CashShift" WHERE "organizationId"=org AND "locationId"=loc AND id=shift_id;
 IF reg IS NULL THEN RAISE EXCEPTION 'closing requires scoped shift' USING ERRCODE='23514'; END IF;
 PERFORM id FROM public."CashRegister" WHERE "organizationId"=org AND "locationId"=loc AND id=reg FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'closing requires scoped register' USING ERRCODE='23514'; END IF;
 PERFORM public.advance_cash_register_gate(org,loc,reg);
 PERFORM id FROM public."CashShift" WHERE "organizationId"=org AND "locationId"=loc AND id=shift_id FOR UPDATE;
END $$;

-- Existing055 prepare_cash_header retained in full, with CLOSE-only additions.
CREATE OR REPLACE FUNCTION public.prepare_cash_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public."CashShift"; shift_id uuid; actor uuid; available numeric;
BEGIN
 IF TG_TABLE_NAME='Checkout' THEN
  IF NEW.mode='DEMO' THEN
   IF NEW."cashShiftId" IS NOT NULL OR NEW."cashShiftVersion" IS NOT NULL THEN RAISE EXCEPTION 'demo has no cash shift' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
 END IF;
 IF TG_TABLE_NAME='CashOperation' THEN shift_id:=NEW."shiftId"; actor:=NEW."actorUserId";
 ELSE shift_id:=NEW."cashShiftId";
  IF TG_TABLE_NAME='Checkout' THEN actor:=NEW."createdByUserId"; ELSE actor:=NEW."actorUserId"; END IF;
 END IF;
 -- New CLOSE takes the shared responsibility gate before the financial Shift lock.
 -- API must perform the same order BEFORE its explicit lockShift; replay returns before this stage.
 IF TG_TABLE_NAME='CashOperation' THEN
  IF NEW.kind='CLOSE' THEN
   PERFORM public.prepare_responsibility_close(NEW."organizationId",NEW."locationId",shift_id);
  END IF;
 END IF;
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=shift_id FOR UPDATE;
 IF s.id IS NULL OR s.status<>'OPEN' OR NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",actor) THEN
  RAISE EXCEPTION 'real financial header requires an open scoped shift and actor' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='CashOperation' THEN
  IF NEW."registerId" IS DISTINCT FROM s."registerId" THEN RAISE EXCEPTION 'cash operation register mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.kind='OPEN' THEN
   IF s.version<>1 OR actor IS DISTINCT FROM s."ownerUserId" OR NEW."openingAmount" IS DISTINCT FROM s."openingAmount" THEN
    RAISE EXCEPTION 'opening operation must match its owner and initial shift' USING ERRCODE='23514'; END IF;
   NEW."cashShiftVersion":=1;
  ELSIF NEW.kind='CLOSE' THEN
   IF EXISTS (SELECT 1 FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "shiftId"=shift_id AND state='ASSIGNED') THEN
    RAISE EXCEPTION 'cash shift has unresolved assigned orders' USING ERRCODE='23514'; END IF;
   IF NEW."expectedVersion" IS DISTINCT FROM s.version OR (actor IS DISTINCT FROM s."ownerUserId" AND (NEW."managerReason" IS NULL OR length(btrim(NEW."managerReason")) NOT BETWEEN 3 AND 500)) THEN
    RAISE EXCEPTION 'closing requires current version and managerial reason for another owner' USING ERRCODE='23514'; END IF;
   NEW."cashShiftVersion":=s.version+1;
  ELSE
   IF NEW.kind NOT IN ('CASH_IN','CASH_OUT') OR actor IS DISTINCT FROM s."ownerUserId"
    OR NEW."expectedVersion" IS DISTINCT FROM s.version THEN
    RAISE EXCEPTION 'drawer movement requires own open shift and current version' USING ERRCODE='23514'; END IF;
   IF NEW.kind='CASH_OUT' THEN
    SELECT "expectedCash" INTO available FROM public.cash_shift_summary(NEW."organizationId",shift_id);
    IF NEW.amount>available THEN RAISE EXCEPTION 'drawer cash out exceeds available cash' USING ERRCODE='23514'; END IF;
   END IF;
   NEW."cashShiftVersion":=s.version+1;
  END IF;
 ELSE
  IF actor IS DISTINCT FROM s."ownerUserId" THEN RAISE EXCEPTION 'money operations require the shift owner' USING ERRCODE='23514'; END IF;
  NEW."cashShiftVersion":=s.version+1;
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;


-- Existing054 open-shift archive guard retained, with pending-only additional rejection.
CREATE OR REPLACE FUNCTION public.protect_open_cash_register() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='ARCHIVED' THEN PERFORM public.advance_cash_register_gate(NEW."organizationId",NEW."locationId",NEW.id); END IF;
 IF NEW.status='ARCHIVED' AND EXISTS (SELECT 1 FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "registerId"=NEW.id AND status='OPEN') THEN
  RAISE EXCEPTION 'register has an open shift' USING ERRCODE='23514'; END IF;
 IF NEW.status='ARCHIVED' AND EXISTS (SELECT 1 FROM public."OrderResponsibility" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "registerId"=NEW.id AND state='PENDING_HANDOFF') THEN
  RAISE EXCEPTION 'cash register has pending handoff' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Invoker functions only. Trigger execution does not grant callers an action capability.
REVOKE ALL ON FUNCTION public.protect_order_responsibility_gate(),
 public.prepare_order_responsibility(uuid,uuid,uuid,uuid[]),public.prepare_responsibility_close(uuid,uuid,uuid),
 public.prepare_responsibility_financial_header(),public.prepare_responsibility_cancellation(),
 public.validate_order_responsibility_event(),public.responsibility_projection(public."OrderResponsibilityEvent"),
 public.protect_order_responsibility(),public.apply_order_responsibility_event(),
 public.check_order_responsibility_effect(),public.validate_order_responsibility_command(),
 public.check_order_responsibility_command(),public.derive_order_responsibility(),
 public.check_order_responsibility_business_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_order_responsibility(uuid,uuid,uuid,uuid[]),public.prepare_responsibility_close(uuid,uuid,uuid),
 public.responsibility_projection(public."OrderResponsibilityEvent") TO pos_runtime;
INSERT INTO public."Permission"(key,label,"scopeTypes",delegable) VALUES
 ('orders.handoff','Asumarea și predarea comenzilor proprii',ARRAY['LOCATION'],true),
 ('orders.handoff-others','Pregătirea predării comenzilor altui casier',ARRAY['LOCATION'],true);
-- canUse/canGrant remain the centralized authority for action, delegation, amount visibility and MFA.
-- SQL proves tenant/source exactness, current actor, nominal own ASSIGN/ACCEPT, durable reason for
-- PREPARE by another actor, terminal claims, complete projection and source-derived resolution.
-- No action flag, no HMAC layer, no implicit close-others permission, no business RLS bypass.
-- All historical rows and their request hashes remain untouched. New gates exist only for new work.
COMMIT;
