-- DEV095: explicit drawer movements; immutable historical rows and closing snapshots.
BEGIN;
ALTER TABLE "CashOperation" ADD COLUMN amount numeric(18,2), ADD COLUMN reason text;
ALTER TABLE "CashOperation" DROP CONSTRAINT "CashOperation_kind_check", DROP CONSTRAINT "CashOperation_check";
ALTER TABLE "CashOperation" ADD CONSTRAINT cash_operation_kind_v2 CHECK (kind IN ('OPEN','CLOSE','CASH_IN','CASH_OUT')),
 ADD CONSTRAINT cash_operation_shape_v2 CHECK (
 (kind='OPEN' AND "expectedVersion" IS NULL AND "cashShiftVersion"=1
  AND "openingAmount" IS NOT NULL AND "openingAmount">=0 AND "openingAmount"<'Infinity'::numeric
  AND "countedCash" IS NULL AND "discrepancyReason" IS NULL AND "managerReason" IS NULL AND amount IS NULL AND reason IS NULL)
 OR (kind='CLOSE' AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
  AND "cashShiftVersion"="expectedVersion"+1 AND "openingAmount" IS NULL
  AND "countedCash" IS NOT NULL AND "countedCash">=0 AND "countedCash"<'Infinity'::numeric AND amount IS NULL AND reason IS NULL)
 OR (kind IN ('CASH_IN','CASH_OUT') AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
  AND "cashShiftVersion"="expectedVersion"+1 AND amount IS NOT NULL AND amount>0 AND amount<'Infinity'::numeric
  AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 3 AND 500
  AND "openingAmount" IS NULL AND "countedCash" IS NULL AND "discrepancyReason" IS NULL AND "managerReason" IS NULL));
CREATE UNIQUE INDEX cash_operation_open_close_once ON "CashOperation"("organizationId","shiftId",kind) WHERE kind IN ('OPEN','CLOSE');
ALTER TABLE "CashOperation" DROP CONSTRAINT "CashOperation_organizationId_shiftId_kind_key";
ALTER TABLE "CashShiftActivity" DROP CONSTRAINT "CashShiftActivity_kind_check", DROP CONSTRAINT "CashShiftActivity_check";
ALTER TABLE "CashShiftActivity" ADD CONSTRAINT cash_activity_kind_v2 CHECK (kind IN ('OPEN','CLOSE','COLLECT','REFUND','CHECKOUT_MANUAL','CASH_IN','CASH_OUT')),
 ADD CONSTRAINT cash_activity_source_v2 CHECK (
 (kind IN ('OPEN','CLOSE','CASH_IN','CASH_OUT') AND "cashOperationId" IS NOT NULL AND "orderId" IS NULL AND "paymentOperationId" IS NULL AND "checkoutId" IS NULL)
 OR (kind IN ('COLLECT','REFUND') AND "paymentOperationId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "checkoutId" IS NULL)
 OR (kind='CHECKOUT_MANUAL' AND "checkoutId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "paymentOperationId" IS NULL));
ALTER TABLE "CashCommandClaim" DROP CONSTRAINT "CashCommandClaim_check";
ALTER TABLE "CashCommandClaim" ADD CONSTRAINT cash_claim_target_v2 CHECK (
 (family='PAYMENT' AND kind IN ('COLLECT','REFUND') AND "orderId" IS NOT NULL AND "registerId" IS NULL AND "shiftId" IS NULL)
 OR (family='CHECKOUT' AND kind IN ('CHECKOUT_MANUAL','CHECKOUT_DEMO') AND "orderId" IS NOT NULL AND "registerId" IS NULL AND "shiftId" IS NULL)
 OR (family='CASH' AND kind='OPEN' AND "orderId" IS NULL AND "registerId" IS NOT NULL AND "shiftId" IS NULL)
 OR (family='CASH' AND kind IN ('CLOSE','CASH_IN','CASH_OUT') AND "orderId" IS NULL AND "registerId" IS NULL AND "shiftId" IS NOT NULL));
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_kind_check", DROP CONSTRAINT "CashMovement_check";
ALTER TABLE "CashMovement" ADD CONSTRAINT cash_movement_kind_v2 CHECK (kind IN ('OPENING','PAYMENT','REFUND','CASH_IN','CASH_OUT')),
 ADD CONSTRAINT cash_movement_source_v2 CHECK (
 (kind='OPENING' AND direction='IN' AND "cashOperationId" IS NOT NULL AND "orderId" IS NULL AND "paymentId" IS NULL AND "refundId" IS NULL)
 OR (kind='PAYMENT' AND direction='IN' AND "paymentId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "refundId" IS NULL)
 OR (kind='REFUND' AND direction='OUT' AND amount>0 AND "refundId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "paymentId" IS NULL)
 OR (kind IN ('CASH_IN','CASH_OUT') AND direction=(CASE WHEN kind='CASH_IN' THEN 'IN' ELSE 'OUT' END) AND amount>0
  AND "cashOperationId" IS NOT NULL AND "orderId" IS NULL AND "paymentId" IS NULL AND "refundId" IS NULL));
ALTER TABLE "CashClosing" ADD COLUMN "cashIn" numeric, ADD COLUMN "cashOut" numeric,
 ADD CONSTRAINT cash_closing_drawer_shape CHECK (("cashIn" IS NULL AND "cashOut" IS NULL)
  OR ("cashIn" IS NOT NULL AND "cashOut" IS NOT NULL AND "cashIn">=0 AND "cashIn"<'Infinity'::numeric AND "cashOut">=0 AND "cashOut"<'Infinity'::numeric));
-- Keep the054 function signature available: PostgreSQL cannot replace RETURNS TABLE in place.
CREATE FUNCTION public.cash_shift_summary_v2(org uuid,shift_id uuid) RETURNS TABLE (
 "cashCollected" numeric,"cashRefunded" numeric,"expectedCash" numeric,
 "cardCollected" numeric,"cardRefunded" numeric,"cardNet" numeric,"paidOrderCount" bigint,"refundOperationCount" bigint,
 "cashIn" numeric,"cashOut" numeric)
LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 SELECT s.*,m.incoming,m.outgoing FROM public.cash_shift_summary(org,shift_id) s CROSS JOIN (
  SELECT coalesce(sum(amount) FILTER (WHERE kind='CASH_IN'),0) AS incoming,
   coalesce(sum(amount) FILTER (WHERE kind='CASH_OUT'),0) AS outgoing
  FROM public."CashOperation" WHERE "organizationId"=org AND "shiftId"=shift_id
 ) m
$$;


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

CREATE OR REPLACE FUNCTION public.validate_cash_claim() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE h jsonb;
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'cash claim requires current scoped actor' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  h:=public.cash_header_source(NEW."organizationId",NEW.kind,coalesce(NEW."paymentOperationId",NEW."checkoutId",NEW."cashOperationId"));
  IF h IS NULL OR (NEW."locationId",NEW.family,NEW."requestKey",NEW."requestHash",NEW."actorUserId",NEW."orderId",NEW."registerId",NEW."shiftId")
   IS DISTINCT FROM ((h->>'locationId')::uuid,h->>'family',(h->>'requestKey')::uuid,h->>'requestHash',(h->>'actorUserId')::uuid,
    (h->>'orderId')::uuid,CASE WHEN NEW.kind='OPEN' THEN (h->>'registerId')::uuid END,CASE WHEN NEW.kind IN ('CLOSE','CASH_IN','CASH_OUT') THEN (h->>'cashShiftId')::uuid END)
   OR (NEW.kind<>'CHECKOUT_DEMO' AND h->>'cashShiftId' IS NULL) THEN
   RAISE EXCEPTION 'cash claim requires its exact new source identity' USING ERRCODE='23514'; END IF;
 ELSE
  -- Acquire only the parent mutex before the terminal key, never an immutable Payment lock.
  IF NEW.family IN ('PAYMENT','CHECKOUT') THEN
   PERFORM id FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
  ELSIF NEW.kind='OPEN' THEN
   PERFORM id FROM public."CashRegister" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."registerId" FOR UPDATE;
  ELSE
   PERFORM id FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."shiftId" FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'retirement requires its scoped target' USING ERRCODE='23514'; END IF;
  IF (NEW.family='PAYMENT' AND EXISTS (SELECT 1 FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey"))
   OR (NEW.family='CHECKOUT' AND EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey"))
   OR (NEW.family='CASH' AND EXISTS (SELECT 1 FROM public."CashOperation" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey")) THEN
   RAISE EXCEPTION 'cannot retire an existing command, including historical demo checkout' USING ERRCODE='23514'; END IF;
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.apply_cash_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; k text; activity_id uuid;
BEGIN
 IF TG_TABLE_NAME='Checkout' THEN k:=CASE WHEN NEW.mode='DEMO' THEN 'CHECKOUT_DEMO' ELSE 'CHECKOUT_MANUAL' END;
 ELSE k:=NEW.kind; END IF;
 h:=public.cash_header_source(NEW."organizationId",k,NEW.id);
 IF k<>'CHECKOUT_DEMO' THEN
  IF k='OPEN' THEN SELECT "lastActivityId" INTO activity_id FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=(h->>'cashShiftId')::uuid;
  ELSE activity_id:=gen_random_uuid(); END IF;
  INSERT INTO public."CashShiftActivity"(id,"organizationId","locationId","shiftId","shiftVersion",kind,"actorUserId","orderId","paymentOperationId","checkoutId","cashOperationId")
   VALUES(activity_id,NEW."organizationId",NEW."locationId",(h->>'cashShiftId')::uuid,(h->>'cashShiftVersion')::integer,k,(h->>'actorUserId')::uuid,(h->>'orderId')::uuid,
    CASE WHEN TG_TABLE_NAME='PaymentOperation' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='Checkout' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='CashOperation' THEN NEW.id END);
  IF k<>'OPEN' THEN
   UPDATE public."CashShift" SET version=(h->>'cashShiftVersion')::integer,"lastActivityId"=activity_id,status=CASE WHEN k='CLOSE' THEN 'CLOSED' ELSE 'OPEN' END
    WHERE "organizationId"=NEW."organizationId" AND id=(h->>'cashShiftId')::uuid;
  END IF;
 END IF;
 INSERT INTO public."CashCommandClaim"(id,"organizationId","locationId",family,kind,"requestKey","actorUserId","orderId","registerId","shiftId",status,"requestHash","paymentOperationId","checkoutId","cashOperationId")
  VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",h->>'family',k,(h->>'requestKey')::uuid,(h->>'actorUserId')::uuid,(h->>'orderId')::uuid,
   CASE WHEN k='OPEN' THEN (h->>'registerId')::uuid END,CASE WHEN k IN ('CLOSE','CASH_IN','CASH_OUT') THEN (h->>'cashShiftId')::uuid END,'SUCCEEDED',h->>'requestHash',
   CASE WHEN TG_TABLE_NAME='PaymentOperation' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='Checkout' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='CashOperation' THEN NEW.id END);
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_cash_movement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source jsonb; s public."CashShift";
BEGIN
 IF NEW.kind='OPENING' THEN
  SELECT to_jsonb(o)||jsonb_build_object('cashShiftId',o."shiftId",'amount',o."openingAmount",'currency','MDL') INTO source FROM public."CashOperation" o
   WHERE o."organizationId"=NEW."organizationId" AND o.id=NEW."cashOperationId" AND o.kind='OPEN';
 ELSIF NEW.kind IN ('CASH_IN','CASH_OUT') THEN
  SELECT to_jsonb(o)||jsonb_build_object('cashShiftId',o."shiftId",'currency','MDL') INTO source FROM public."CashOperation" o
   WHERE o."organizationId"=NEW."organizationId" AND o.id=NEW."cashOperationId" AND o.kind=NEW.kind;
 ELSIF NEW.kind='PAYMENT' THEN
  SELECT to_jsonb(p)||jsonb_build_object('actorUserId',p."confirmedByUserId") INTO source FROM public."Payment" p
   WHERE p."organizationId"=NEW."organizationId" AND p.id=NEW."paymentId" AND p.method='CASH';
 ELSE
  SELECT to_jsonb(p) INTO source FROM public."PaymentRefund" p WHERE p."organizationId"=NEW."organizationId" AND p.id=NEW."refundId" AND p.method='CASH';
 END IF;
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW."shiftId";
 IF source IS NULL OR s.id IS NULL OR s.status<>'OPEN'
  OR (NEW."locationId",NEW."shiftId",NEW."orderId",NEW."actorUserId",NEW.amount,NEW.currency)
   IS DISTINCT FROM ((source->>'locationId')::uuid,(source->>'cashShiftId')::uuid,(source->>'orderId')::uuid,(source->>'actorUserId')::uuid,(source->>'amount')::numeric,source->>'currency') THEN
  RAISE EXCEPTION 'cash movement must exactly match its real cash source' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=(source->>'createdAt')::timestamptz; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.derive_cash_movement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE k text; shift_id uuid; actor uuid; amount_ numeric; order_id uuid;
BEGIN
 IF TG_TABLE_NAME='CashOperation' THEN
  IF NEW.kind NOT IN ('OPEN','CASH_IN','CASH_OUT') THEN RETURN NULL; END IF;
  k:=CASE WHEN NEW.kind='OPEN' THEN 'OPENING' ELSE NEW.kind END; shift_id:=NEW."shiftId"; actor:=NEW."actorUserId";
  amount_:=CASE WHEN NEW.kind='OPEN' THEN NEW."openingAmount" ELSE NEW.amount END;
 ELSE
  IF NEW.method<>'CASH' THEN RETURN NULL; END IF;
  k:=CASE WHEN TG_TABLE_NAME='Payment' THEN 'PAYMENT' ELSE 'REFUND' END;
  shift_id:=NEW."cashShiftId"; amount_:=NEW.amount; order_id:=NEW."orderId";
  IF TG_TABLE_NAME='Payment' THEN actor:=NEW."confirmedByUserId"; ELSE actor:=NEW."actorUserId"; END IF;
 END IF;
 INSERT INTO public."CashMovement"(id,"organizationId","locationId","shiftId",kind,direction,amount,currency,"actorUserId","orderId","paymentId","refundId","cashOperationId")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",shift_id,k,CASE WHEN k IN ('REFUND','CASH_OUT') THEN 'OUT' ELSE 'IN' END,amount_,'MDL',actor,order_id,
  CASE WHEN TG_TABLE_NAME='Payment' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='PaymentRefund' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='CashOperation' THEN NEW.id END);
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_cash_closing() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."CashOperation"; s public."CashShift"; totals record; display_name text;
BEGIN
 SELECT * INTO o FROM public."CashOperation" WHERE "organizationId"=NEW."organizationId" AND id=NEW."cashOperationId";
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW."shiftId";
 SELECT * INTO totals FROM public.cash_shift_summary_v2(NEW."organizationId",NEW."shiftId");
 SELECT "displayName" INTO display_name FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=o."actorUserId";
 IF o.id IS NULL OR o.kind<>'CLOSE' OR s.id IS NULL OR s.status<>'CLOSED'
  OR (NEW."locationId",NEW."shiftId",NEW."shiftVersion",NEW."closedByUserId",NEW."closedByDisplayName",NEW."closedAt",NEW."countedCash",NEW."discrepancyReason",NEW."managerReason")
   IS DISTINCT FROM (o."locationId",o."shiftId",o."cashShiftVersion",o."actorUserId",display_name,o."createdAt",o."countedCash",o."discrepancyReason",o."managerReason")
  OR (s.version,s."closedAt") IS DISTINCT FROM (o."cashShiftVersion",o."createdAt")
  OR (NEW."cashCollected",NEW."cashRefunded",NEW."expectedCash",NEW."cardCollected",NEW."cardRefunded",NEW."cardNet",NEW."paidOrderCount",NEW."refundOperationCount")
   IS DISTINCT FROM (totals."cashCollected",totals."cashRefunded",totals."expectedCash",totals."cardCollected",totals."cardRefunded",totals."cardNet",totals."paidOrderCount",totals."refundOperationCount")
  OR NEW."cashIn" IS NULL OR NEW."cashOut" IS NULL
  OR (NEW."cashIn",NEW."cashOut") IS DISTINCT FROM (totals."cashIn",totals."cashOut")
  OR NEW.difference IS DISTINCT FROM o."countedCash"-totals."expectedCash" THEN
  RAISE EXCEPTION 'closing snapshot must match exact immutable operation and complete ledger' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.derive_cash_closing() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE totals record; actor_name text;
BEGIN
 IF NEW.kind<>'CLOSE' THEN RETURN NULL; END IF;
 SELECT * INTO totals FROM public.cash_shift_summary_v2(NEW."organizationId",NEW."shiftId");
 SELECT "displayName" INTO actor_name FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 INSERT INTO public."CashClosing"(id,"organizationId","locationId","shiftId","cashOperationId","shiftVersion","closedByUserId","closedByDisplayName","closedAt",
  "expectedCash","countedCash",difference,"cashCollected","cashRefunded","cardCollected","cardRefunded","cardNet","paidOrderCount","refundOperationCount","discrepancyReason","managerReason","cashIn","cashOut")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."shiftId",NEW.id,NEW."cashShiftVersion",NEW."actorUserId",actor_name,NEW."createdAt",
  totals."expectedCash",NEW."countedCash",NEW."countedCash"-totals."expectedCash",totals."cashCollected",totals."cashRefunded",totals."cardCollected",totals."cardRefunded",totals."cardNet",
  totals."paidOrderCount",totals."refundOperationCount",NEW."discrepancyReason",NEW."managerReason",totals."cashIn",totals."cashOut");
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.check_cash_shift_effect() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public."CashShift"; a public."CashShiftActivity"; totals record;
BEGIN
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO a FROM public."CashShiftActivity" WHERE "organizationId"=NEW."organizationId" AND id=NEW."lastActivityId";
 SELECT * INTO totals FROM public.cash_shift_summary_v2(NEW."organizationId",NEW.id);
 IF s.id IS NULL OR to_jsonb(s) IS DISTINCT FROM to_jsonb(NEW) OR a.id IS NULL
  OR (a."locationId",a."shiftId",a."shiftVersion") IS DISTINCT FROM (NEW."locationId",NEW.id,NEW.version)
  OR (TG_OP='INSERT' AND a.kind<>'OPEN')
  OR (NEW.status='CLOSED' AND (a.kind<>'CLOSE' OR NOT EXISTS (SELECT 1 FROM public."CashClosing" c
   WHERE c."organizationId"=NEW."organizationId" AND c."shiftId"=NEW.id AND c."cashOperationId"=a."cashOperationId" AND c."shiftVersion"=NEW.version)))
  OR totals."expectedCash"<0 OR totals."expectedCash" IS DISTINCT FROM NEW."openingAmount"+totals."cashCollected"-totals."cashRefunded"+totals."cashIn"-totals."cashOut" THEN
  RAISE EXCEPTION 'shift version, exact complete ledger and terminal closing must commit together' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

-- CREATE OR REPLACE preserves existing054 ACL. Only the newly added invoker function needs grants.
REVOKE ALL ON FUNCTION public.cash_shift_summary_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cash_shift_summary_v2(uuid,uuid) TO pos_runtime;
INSERT INTO public."Permission"(key,label,"scopeTypes",delegable)
 VALUES('cash.movements.create','Introducerea și retragerea numerarului',ARRAY['LOCATION'],true);
-- Central API canUse authorizes capabilities, scopes, delegation and monetary limits.
-- SQL enforces current actor, own OPEN shift, exact version, immutable sources and cash conservation.
-- No new table, role, RLS bypass, source UPDATE, historical movement or old-row backfill.
COMMIT;
