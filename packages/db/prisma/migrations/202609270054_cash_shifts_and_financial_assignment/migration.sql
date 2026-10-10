-- DEV-092/094/093: coordinated financial assignment; preserve all preexisting rows and hashes.
-- Integration: new z_cash_* BEFORE triggers sort AFTER payment_operation_creation (042),
-- checkout_creation (042), payment_creation and payment_refund_creation (043).
-- Their original functions, deferred allocation/event/completion guards and inventory guards remain unchanged.
-- Action grants/MFA/DENY remain in central API canUse. SQL enforces scope, monetary ownership and integrity.
BEGIN;
LOCK TABLE "PaymentOperation","Checkout","Payment","PaymentRefund" IN SHARE ROW EXCLUSIVE MODE;
-- A row lock without a write cannot refresh an old RR snapshot. Both OPEN and archive
-- advance this non-financial mutex; it is lazy, so no tenant data backfill is required.
CREATE TABLE "CashRegisterGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "registerId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 PRIMARY KEY ("organizationId","registerId"),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id)
);
CREATE TABLE "CashShift" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "registerId" uuid NOT NULL, "ownerUserId" uuid NOT NULL,
 "registerCode" text NOT NULL, "registerName" text NOT NULL, "ownerDisplayName" text NOT NULL,
 "openingAmount" numeric(18,2) NOT NULL CHECK ("openingAmount">=0 AND "openingAmount"<'Infinity'::numeric),
 currency text NOT NULL DEFAULT 'MDL' CHECK (currency='MDL'),
 status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0), "lastActivityId" uuid NOT NULL,
 "openedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" timestamptz(3),
 CHECK ((status='OPEN' AND "closedAt" IS NULL) OR (status='CLOSED' AND "closedAt" IS NOT NULL)),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","ownerUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE UNIQUE INDEX cash_shift_open_register ON "CashShift"("organizationId","registerId") WHERE status='OPEN';
CREATE INDEX cash_shift_owner_list ON "CashShift"("organizationId","locationId","ownerUserId",status,"openedAt",id);
CREATE TABLE "CashOperation" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "shiftId" uuid NOT NULL, "registerId" uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('OPEN','CLOSE')),
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
 "actorUserId" uuid NOT NULL, "expectedVersion" integer, "cashShiftVersion" integer NOT NULL,
 "openingAmount" numeric(18,2), "countedCash" numeric(18,2), "discrepancyReason" text, "managerReason" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind='OPEN' AND "expectedVersion" IS NULL AND "cashShiftVersion"=1
   AND "openingAmount" IS NOT NULL AND "openingAmount">=0 AND "openingAmount"<'Infinity'::numeric
   AND "countedCash" IS NULL AND "discrepancyReason" IS NULL AND "managerReason" IS NULL)
  OR (kind='CLOSE' AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
   AND "cashShiftVersion"="expectedVersion"+1 AND "openingAmount" IS NULL
   AND "countedCash" IS NOT NULL AND "countedCash">=0 AND "countedCash"<'Infinity'::numeric)),
 CHECK ("discrepancyReason" IS NULL OR length(btrim("discrepancyReason")) BETWEEN 3 AND 500),
 CHECK ("managerReason" IS NULL OR length(btrim("managerReason")) BETWEEN 3 AND 500),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","locationId","requestKey"), UNIQUE ("organizationId","shiftId",kind),
 FOREIGN KEY ("organizationId","locationId","shiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
ALTER TABLE "PaymentOperation" ADD COLUMN "cashShiftId" uuid, ADD COLUMN "cashShiftVersion" integer,
 ADD CONSTRAINT payment_operation_shift_shape CHECK (("cashShiftId" IS NULL AND "cashShiftVersion" IS NULL)
  OR ("cashShiftId" IS NOT NULL AND "cashShiftVersion" IS NOT NULL AND "cashShiftVersion">1)),
 ADD CONSTRAINT payment_operation_cash_shift_fk FOREIGN KEY ("organizationId","locationId","cashShiftId")
  REFERENCES "CashShift"("organizationId","locationId",id);
ALTER TABLE "Checkout" ADD COLUMN "cashShiftId" uuid, ADD COLUMN "cashShiftVersion" integer,
 ADD CONSTRAINT checkout_shift_shape CHECK (("cashShiftId" IS NULL AND "cashShiftVersion" IS NULL)
  OR (mode='MANUAL' AND "cashShiftId" IS NOT NULL AND "cashShiftVersion" IS NOT NULL AND "cashShiftVersion">1)),
 ADD CONSTRAINT checkout_cash_shift_fk FOREIGN KEY ("organizationId","locationId","cashShiftId")
  REFERENCES "CashShift"("organizationId","locationId",id);
ALTER TABLE "Payment" ADD COLUMN "cashShiftId" uuid,
 ADD CONSTRAINT payment_cash_shift_fk FOREIGN KEY ("organizationId","locationId","cashShiftId")
  REFERENCES "CashShift"("organizationId","locationId",id);
ALTER TABLE "PaymentRefund" ADD COLUMN "cashShiftId" uuid,
 ADD CONSTRAINT refund_cash_shift_fk FOREIGN KEY ("organizationId","locationId","cashShiftId")
  REFERENCES "CashShift"("organizationId","locationId",id),
 ADD CONSTRAINT refund_cash_source_scope UNIQUE ("organizationId","locationId","orderId",id);
CREATE TABLE "CashShiftActivity" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "shiftId" uuid NOT NULL, "shiftVersion" integer NOT NULL CHECK ("shiftVersion">0),
 kind text NOT NULL CHECK (kind IN ('OPEN','CLOSE','COLLECT','REFUND','CHECKOUT_MANUAL')),
 "actorUserId" uuid NOT NULL, "orderId" uuid, "paymentOperationId" uuid, "checkoutId" uuid, "cashOperationId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind IN ('OPEN','CLOSE') AND "cashOperationId" IS NOT NULL AND "orderId" IS NULL AND "paymentOperationId" IS NULL AND "checkoutId" IS NULL)
  OR (kind IN ('COLLECT','REFUND') AND "paymentOperationId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "checkoutId" IS NULL)
  OR (kind='CHECKOUT_MANUAL' AND "checkoutId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "paymentOperationId" IS NULL)),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId","shiftId",id),
 UNIQUE ("organizationId","shiftId","shiftVersion"), UNIQUE ("organizationId","paymentOperationId"),
 UNIQUE ("organizationId","checkoutId"), UNIQUE ("organizationId","cashOperationId"),
 FOREIGN KEY ("organizationId","locationId","shiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","paymentOperationId") REFERENCES "PaymentOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","checkoutId") REFERENCES "Checkout"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","cashOperationId") REFERENCES "CashOperation"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id)
);
ALTER TABLE "CashShift" ADD CONSTRAINT cash_shift_last_activity_fk
 FOREIGN KEY ("organizationId","locationId",id,"lastActivityId")
 REFERENCES "CashShiftActivity"("organizationId","locationId","shiftId",id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE "CashCommandClaim" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 family text NOT NULL CHECK (family IN ('PAYMENT','CHECKOUT','CASH')),
 kind text NOT NULL, "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 "orderId" uuid, "registerId" uuid, "shiftId" uuid,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')), "requestHash" text,
 "paymentOperationId" uuid, "checkoutId" uuid, "cashOperationId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((family='PAYMENT' AND kind IN ('COLLECT','REFUND') AND "orderId" IS NOT NULL AND "registerId" IS NULL AND "shiftId" IS NULL)
  OR (family='CHECKOUT' AND kind IN ('CHECKOUT_MANUAL','CHECKOUT_DEMO') AND "orderId" IS NOT NULL AND "registerId" IS NULL AND "shiftId" IS NULL)
  OR (family='CASH' AND kind='OPEN' AND "orderId" IS NULL AND "registerId" IS NOT NULL AND "shiftId" IS NULL)
  OR (family='CASH' AND kind='CLOSE' AND "orderId" IS NULL AND "registerId" IS NULL AND "shiftId" IS NOT NULL)),
 CHECK ((status='RETIRED' AND "requestHash" IS NULL AND "paymentOperationId" IS NULL AND "checkoutId" IS NULL AND "cashOperationId" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'
   AND ((family='PAYMENT' AND "paymentOperationId" IS NOT NULL AND "checkoutId" IS NULL AND "cashOperationId" IS NULL)
    OR (family='CHECKOUT' AND "checkoutId" IS NOT NULL AND "paymentOperationId" IS NULL AND "cashOperationId" IS NULL)
    OR (family='CASH' AND "cashOperationId" IS NOT NULL AND "paymentOperationId" IS NULL AND "checkoutId" IS NULL)))),
 UNIQUE ("organizationId","locationId",family,"requestKey"), UNIQUE ("organizationId","paymentOperationId"),
 UNIQUE ("organizationId","checkoutId"), UNIQUE ("organizationId","cashOperationId"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","shiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","paymentOperationId") REFERENCES "PaymentOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","checkoutId") REFERENCES "Checkout"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","cashOperationId") REFERENCES "CashOperation"("organizationId","locationId",id)
);
CREATE TABLE "CashMovement" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "shiftId" uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('OPENING','PAYMENT','REFUND')), direction text NOT NULL CHECK (direction IN ('IN','OUT')),
 amount numeric(18,2) NOT NULL CHECK (amount>=0 AND amount<'Infinity'::numeric), currency text NOT NULL CHECK (currency='MDL'),
 "actorUserId" uuid NOT NULL, "orderId" uuid, "paymentId" uuid, "refundId" uuid, "cashOperationId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind='OPENING' AND direction='IN' AND "cashOperationId" IS NOT NULL AND "orderId" IS NULL AND "paymentId" IS NULL AND "refundId" IS NULL)
  OR (kind='PAYMENT' AND direction='IN' AND "paymentId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "refundId" IS NULL)
  OR (kind='REFUND' AND direction='OUT' AND amount>0 AND "refundId" IS NOT NULL AND "orderId" IS NOT NULL AND "cashOperationId" IS NULL AND "paymentId" IS NULL)),
 UNIQUE ("organizationId","paymentId"), UNIQUE ("organizationId","refundId"), UNIQUE ("organizationId","cashOperationId"),
 FOREIGN KEY ("organizationId","locationId","shiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","paymentId") REFERENCES "Payment"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","refundId") REFERENCES "PaymentRefund"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","cashOperationId") REFERENCES "CashOperation"("organizationId","locationId",id)
);
CREATE INDEX cash_movement_shift ON "CashMovement"("organizationId","shiftId","createdAt",id);
CREATE TABLE "CashClosing" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "shiftId" uuid NOT NULL,
 "cashOperationId" uuid NOT NULL, "shiftVersion" integer NOT NULL, "closedByUserId" uuid NOT NULL,
 "closedByDisplayName" text NOT NULL, "closedAt" timestamptz(3) NOT NULL,
 "expectedCash" numeric NOT NULL, "countedCash" numeric(18,2) NOT NULL, difference numeric NOT NULL,
 "cashCollected" numeric NOT NULL, "cashRefunded" numeric NOT NULL,
 "cardCollected" numeric NOT NULL, "cardRefunded" numeric NOT NULL, "cardNet" numeric NOT NULL,
 "paidOrderCount" bigint NOT NULL, "refundOperationCount" bigint NOT NULL,
 "discrepancyReason" text, "managerReason" text,
 CHECK ("expectedCash">=0 AND "expectedCash"<'Infinity'::numeric AND "countedCash">=0 AND "countedCash"<'Infinity'::numeric
  AND difference="countedCash"-"expectedCash" AND "cardNet"="cardCollected"-"cardRefunded"),
 CHECK (difference=0 OR ("discrepancyReason" IS NOT NULL AND length(btrim("discrepancyReason")) BETWEEN 3 AND 500)),
 UNIQUE ("organizationId","shiftId"), UNIQUE ("organizationId","cashOperationId"),
 FOREIGN KEY ("organizationId","locationId","shiftId") REFERENCES "CashShift"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","cashOperationId") REFERENCES "CashOperation"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","closedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['CashRegisterGate','CashShift','CashOperation','CashShiftActivity','CashCommandClaim','CashMovement','CashClosing'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',t);
  IF t NOT IN ('CashShift','CashRegisterGate') THEN
   EXECUTE format('CREATE TRIGGER cash_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE (status,version,"lastActivityId","closedAt") ON "CashShift" TO pos_runtime;
GRANT UPDATE (revision) ON "CashRegisterGate" TO pos_runtime;
CREATE FUNCTION public.protect_cash_register_gate() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'cash register mutex is permanent' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'cash register mutex starts at one' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.revision<>OLD.revision+1 OR (NEW."organizationId",NEW."locationId",NEW."registerId") IS DISTINCT FROM (OLD."organizationId",OLD."locationId",OLD."registerId") THEN
   RAISE EXCEPTION 'cash register mutex identity and generation are protected' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_register_gate_validation BEFORE INSERT OR UPDATE OR DELETE ON "CashRegisterGate" FOR EACH ROW EXECUTE FUNCTION public.protect_cash_register_gate();
CREATE FUNCTION public.advance_cash_register_gate(org uuid,loc uuid,reg uuid) RETURNS void
LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 INSERT INTO public."CashRegisterGate"("organizationId","locationId","registerId") VALUES(org,loc,reg)
 ON CONFLICT ("organizationId","registerId") DO UPDATE SET revision="CashRegisterGate".revision+1
$$;

-- Foundation actor guard from053 validates current LOCAL context and active tenant/location/user.
CREATE FUNCTION public.protect_cash_shift() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."CashRegister"; a public."CashShiftActivity";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'cash shifts are immutable history' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM public."CashRegister" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."registerId" FOR UPDATE;
  IF r.id IS NULL OR r.status<>'ACTIVE' OR NEW.status<>'OPEN' OR NEW.version<>1
   OR NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."ownerUserId") THEN
   RAISE EXCEPTION 'opening requires active register and its scoped current owner' USING ERRCODE='23514'; END IF;
  PERFORM public.advance_cash_register_gate(NEW."organizationId",NEW."locationId",NEW."registerId");
  NEW."registerCode":=r.code; NEW."registerName":=r.name;
  SELECT "displayName" INTO NEW."ownerDisplayName" FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."ownerUserId";
  NEW."openedAt":=statement_timestamp(); NEW."closedAt":=NULL;
 ELSE
  SELECT * INTO a FROM public."CashShiftActivity" WHERE "organizationId"=NEW."organizationId" AND id=NEW."lastActivityId";
  IF OLD.status<>'OPEN' OR NEW.version<>OLD.version+1 OR a.id IS NULL
   OR (a."locationId",a."shiftId",a."shiftVersion") IS DISTINCT FROM (NEW."locationId",NEW.id,NEW.version)
   OR NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",a."actorUserId")
   OR (a.kind<>'CLOSE' AND a."actorUserId" IS DISTINCT FROM NEW."ownerUserId")
   OR NEW.status IS DISTINCT FROM (CASE WHEN a.kind='CLOSE' THEN 'CLOSED' ELSE 'OPEN' END)
   OR (to_jsonb(NEW)-ARRAY['status','version','lastActivityId','closedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','lastActivityId','closedAt']) THEN
   RAISE EXCEPTION 'shift transition requires its exact activity and monotone version' USING ERRCODE='23514'; END IF;
  NEW."closedAt":=CASE WHEN a.kind='CLOSE' THEN a."createdAt" ELSE NULL END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_shift_history BEFORE INSERT OR UPDATE OR DELETE ON "CashShift" FOR EACH ROW EXECUTE FUNCTION public.protect_cash_shift();
CREATE FUNCTION public.protect_open_cash_register() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='ARCHIVED' THEN PERFORM public.advance_cash_register_gate(NEW."organizationId",NEW."locationId",NEW.id); END IF;
 IF NEW.status='ARCHIVED' AND EXISTS (SELECT 1 FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND "registerId"=NEW.id AND status='OPEN') THEN
  RAISE EXCEPTION 'register has an open shift' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z_cash_register_open_guard BEFORE UPDATE ON "CashRegister" FOR EACH ROW EXECUTE FUNCTION public.protect_open_cash_register();
CREATE FUNCTION public.prepare_cash_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public."CashShift"; shift_id uuid; actor uuid;
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
  ELSE
   IF NEW."expectedVersion" IS DISTINCT FROM s.version OR (actor IS DISTINCT FROM s."ownerUserId" AND (NEW."managerReason" IS NULL OR length(btrim(NEW."managerReason")) NOT BETWEEN 3 AND 500)) THEN
    RAISE EXCEPTION 'closing requires current version and managerial reason for another owner' USING ERRCODE='23514'; END IF;
   NEW."cashShiftVersion":=s.version+1;
  END IF;
 ELSE
  IF actor IS DISTINCT FROM s."ownerUserId" THEN RAISE EXCEPTION 'money operations require the shift owner' USING ERRCODE='23514'; END IF;
  NEW."cashShiftVersion":=s.version+1;
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER z_cash_payment_header BEFORE INSERT ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.prepare_cash_header();
CREATE TRIGGER z_cash_checkout_header BEFORE INSERT ON "Checkout" FOR EACH ROW EXECUTE FUNCTION public.prepare_cash_header();
CREATE TRIGGER cash_operation_header BEFORE INSERT ON "CashOperation" FOR EACH ROW EXECUTE FUNCTION public.prepare_cash_header();
-- Canonical source projection: callers cannot supply the authoritative monetary/actor fields.
CREATE FUNCTION public.cash_header_source(org uuid,source_kind text,source_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE body jsonb;
BEGIN
 IF source_kind IN ('COLLECT','REFUND') THEN
  SELECT to_jsonb(p)||jsonb_build_object('family','PAYMENT') INTO body FROM public."PaymentOperation" p
   WHERE p."organizationId"=org AND p.id=source_id AND p.kind=source_kind;
 ELSIF source_kind IN ('CHECKOUT_MANUAL','CHECKOUT_DEMO') THEN
  SELECT to_jsonb(c)||jsonb_build_object('family','CHECKOUT','kind',source_kind,'actorUserId',c."createdByUserId") INTO body
   FROM public."Checkout" c WHERE c."organizationId"=org AND c.id=source_id
    AND c.mode=CASE WHEN source_kind='CHECKOUT_MANUAL' THEN 'MANUAL' ELSE 'DEMO' END;
 ELSE
  SELECT to_jsonb(c)||jsonb_build_object('family','CASH','cashShiftId',c."shiftId") INTO body FROM public."CashOperation" c
   WHERE c."organizationId"=org AND c.id=source_id AND c.kind=source_kind;
 END IF;
 RETURN body;
END $$;
CREATE FUNCTION public.validate_cash_activity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; s public."CashShift";
BEGIN
 h:=public.cash_header_source(NEW."organizationId",NEW.kind,coalesce(NEW."paymentOperationId",NEW."checkoutId",NEW."cashOperationId"));
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW."shiftId";
 IF h IS NULL OR s.id IS NULL OR s.status<>'OPEN'
  OR (NEW."locationId",NEW."shiftId",NEW."shiftVersion",NEW."actorUserId",NEW."orderId")
   IS DISTINCT FROM ((h->>'locationId')::uuid,(h->>'cashShiftId')::uuid,(h->>'cashShiftVersion')::integer,(h->>'actorUserId')::uuid,(h->>'orderId')::uuid)
  OR (NEW.kind='OPEN' AND (s.version<>1 OR NEW.id IS DISTINCT FROM s."lastActivityId"))
  OR (NEW.kind<>'OPEN' AND NEW."shiftVersion"<>s.version+1) THEN
  RAISE EXCEPTION 'cash activity must match its header and next shift version' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=(h->>'createdAt')::timestamptz;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_activity_validation BEFORE INSERT ON "CashShiftActivity" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_activity();
CREATE FUNCTION public.validate_cash_claim() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE h jsonb;
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'cash claim requires current scoped actor' USING ERRCODE='23514'; END IF;
 IF NEW.status='SUCCEEDED' THEN
  h:=public.cash_header_source(NEW."organizationId",NEW.kind,coalesce(NEW."paymentOperationId",NEW."checkoutId",NEW."cashOperationId"));
  IF h IS NULL OR (NEW."locationId",NEW.family,NEW."requestKey",NEW."requestHash",NEW."actorUserId",NEW."orderId",NEW."registerId",NEW."shiftId")
   IS DISTINCT FROM ((h->>'locationId')::uuid,h->>'family',(h->>'requestKey')::uuid,h->>'requestHash',(h->>'actorUserId')::uuid,
    (h->>'orderId')::uuid,CASE WHEN NEW.kind='OPEN' THEN (h->>'registerId')::uuid END,CASE WHEN NEW.kind='CLOSE' THEN (h->>'cashShiftId')::uuid END)
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
CREATE TRIGGER cash_claim_validation BEFORE INSERT ON "CashCommandClaim" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_claim();
-- New DEMO shares CHECKOUT's terminal key; no shift/activity/movement is derived.
ALTER TABLE "CashCommandClaim" ADD CONSTRAINT cash_claim_demo_terminal CHECK (kind<>'CHECKOUT_DEMO' OR status='SUCCEEDED');
CREATE FUNCTION public.apply_cash_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
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
   CASE WHEN k='OPEN' THEN (h->>'registerId')::uuid END,CASE WHEN k='CLOSE' THEN (h->>'cashShiftId')::uuid END,'SUCCEEDED',h->>'requestHash',
   CASE WHEN TG_TABLE_NAME='PaymentOperation' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='Checkout' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='CashOperation' THEN NEW.id END);
 RETURN NULL;
END $$;
CREATE TRIGGER cash_payment_activity AFTER INSERT ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.apply_cash_header();
CREATE TRIGGER cash_checkout_activity AFTER INSERT ON "Checkout" FOR EACH ROW EXECUTE FUNCTION public.apply_cash_header();
CREATE TRIGGER cash_operation_activity AFTER INSERT ON "CashOperation" FOR EACH ROW EXECUTE FUNCTION public.apply_cash_header();
CREATE FUNCTION public.validate_cash_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; s public."CashShift"; actor uuid;
BEGIN
 IF TG_TABLE_NAME='PaymentRefund' THEN h:=public.cash_header_source(NEW."organizationId",'REFUND',NEW."operationId"); actor:=NEW."actorUserId";
 ELSIF NEW."operationId" IS NOT NULL THEN h:=public.cash_header_source(NEW."organizationId",'COLLECT',NEW."operationId"); actor:=NEW."confirmedByUserId";
 ELSE h:=public.cash_header_source(NEW."organizationId",'CHECKOUT_MANUAL',NEW."checkoutId"); actor:=NEW."confirmedByUserId"; END IF;
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW."cashShiftId";
 IF h IS NULL OR s.id IS NULL OR s.status<>'OPEN'
  OR (NEW."locationId",NEW."orderId",NEW."cashShiftId",actor) IS DISTINCT FROM ((h->>'locationId')::uuid,(h->>'orderId')::uuid,(h->>'cashShiftId')::uuid,(h->>'actorUserId')::uuid)
  OR s."ownerUserId" IS DISTINCT FROM actor OR s.version IS DISTINCT FROM (h->>'cashShiftVersion')::integer THEN
  RAISE EXCEPTION 'cash allocation requires its exact current owning header shift' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z_cash_payment_allocation BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_allocation();
CREATE TRIGGER z_cash_refund_allocation BEFORE INSERT ON "PaymentRefund" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_allocation();
CREATE FUNCTION public.validate_cash_movement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source jsonb; s public."CashShift";
BEGIN
 IF NEW.kind='OPENING' THEN
  SELECT to_jsonb(o)||jsonb_build_object('cashShiftId',o."shiftId",'amount',o."openingAmount",'currency','MDL') INTO source FROM public."CashOperation" o
   WHERE o."organizationId"=NEW."organizationId" AND o.id=NEW."cashOperationId" AND o.kind='OPEN';
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
CREATE TRIGGER cash_movement_validation BEFORE INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_movement();
CREATE FUNCTION public.derive_cash_movement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE k text; shift_id uuid; actor uuid; amount_ numeric; order_id uuid;
BEGIN
 IF TG_TABLE_NAME='CashOperation' THEN
  IF NEW.kind<>'OPEN' THEN RETURN NULL; END IF;
  k:='OPENING'; shift_id:=NEW."shiftId"; actor:=NEW."actorUserId"; amount_:=NEW."openingAmount";
 ELSE
  IF NEW.method<>'CASH' THEN RETURN NULL; END IF;
  k:=CASE WHEN TG_TABLE_NAME='Payment' THEN 'PAYMENT' ELSE 'REFUND' END;
  shift_id:=NEW."cashShiftId"; amount_:=NEW.amount; order_id:=NEW."orderId";
  IF TG_TABLE_NAME='Payment' THEN actor:=NEW."confirmedByUserId"; ELSE actor:=NEW."actorUserId"; END IF;
 END IF;
 INSERT INTO public."CashMovement"(id,"organizationId","locationId","shiftId",kind,direction,amount,currency,"actorUserId","orderId","paymentId","refundId","cashOperationId")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",shift_id,k,CASE WHEN k='REFUND' THEN 'OUT' ELSE 'IN' END,amount_,'MDL',actor,order_id,
  CASE WHEN TG_TABLE_NAME='Payment' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='PaymentRefund' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='CashOperation' THEN NEW.id END);
 RETURN NULL;
END $$;
CREATE TRIGGER cash_payment_movement AFTER INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION public.derive_cash_movement();
CREATE TRIGGER cash_refund_movement AFTER INSERT ON "PaymentRefund" FOR EACH ROW EXECUTE FUNCTION public.derive_cash_movement();
CREATE TRIGGER cash_opening_movement AFTER INSERT ON "CashOperation" FOR EACH ROW EXECUTE FUNCTION public.derive_cash_movement();
CREATE FUNCTION public.cash_shift_summary(org uuid,shift_id uuid) RETURNS TABLE (
 "cashCollected" numeric,"cashRefunded" numeric,"expectedCash" numeric,
 "cardCollected" numeric,"cardRefunded" numeric,"cardNet" numeric,"paidOrderCount" bigint,"refundOperationCount" bigint)
LANGUAGE sql VOLATILE SET search_path=pg_catalog,public AS $$
 WITH collected AS (
  SELECT coalesce(sum(amount) FILTER (WHERE method='CASH'),0) AS cash,
   coalesce(sum(amount) FILTER (WHERE method='CARD'),0) AS card,count(DISTINCT "orderId") AS orders
  FROM public."Payment" WHERE "organizationId"=org AND "cashShiftId"=shift_id
 ), refunded AS (
  SELECT coalesce(sum(amount) FILTER (WHERE method='CASH'),0) AS cash,
   coalesce(sum(amount) FILTER (WHERE method='CARD'),0) AS card,count(DISTINCT "operationId") AS operations
  FROM public."PaymentRefund" WHERE "organizationId"=org AND "cashShiftId"=shift_id
 ), ledger AS (
  SELECT coalesce(sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END),0) AS expected
  FROM public."CashMovement" WHERE "organizationId"=org AND "shiftId"=shift_id
 ) SELECT c.cash,r.cash,l.expected,c.card,r.card,c.card-r.card,c.orders,r.operations
 FROM collected c CROSS JOIN refunded r CROSS JOIN ledger l
$$;
CREATE FUNCTION public.validate_cash_closing() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."CashOperation"; s public."CashShift"; totals record; display_name text;
BEGIN
 SELECT * INTO o FROM public."CashOperation" WHERE "organizationId"=NEW."organizationId" AND id=NEW."cashOperationId";
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW."shiftId";
 SELECT * INTO totals FROM public.cash_shift_summary(NEW."organizationId",NEW."shiftId");
 SELECT "displayName" INTO display_name FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=o."actorUserId";
 IF o.id IS NULL OR o.kind<>'CLOSE' OR s.id IS NULL OR s.status<>'CLOSED'
  OR (NEW."locationId",NEW."shiftId",NEW."shiftVersion",NEW."closedByUserId",NEW."closedByDisplayName",NEW."closedAt",NEW."countedCash",NEW."discrepancyReason",NEW."managerReason")
   IS DISTINCT FROM (o."locationId",o."shiftId",o."cashShiftVersion",o."actorUserId",display_name,o."createdAt",o."countedCash",o."discrepancyReason",o."managerReason")
  OR (s.version,s."closedAt") IS DISTINCT FROM (o."cashShiftVersion",o."createdAt")
  OR (NEW."cashCollected",NEW."cashRefunded",NEW."expectedCash",NEW."cardCollected",NEW."cardRefunded",NEW."cardNet",NEW."paidOrderCount",NEW."refundOperationCount")
   IS DISTINCT FROM (totals."cashCollected",totals."cashRefunded",totals."expectedCash",totals."cardCollected",totals."cardRefunded",totals."cardNet",totals."paidOrderCount",totals."refundOperationCount")
  OR NEW.difference IS DISTINCT FROM o."countedCash"-totals."expectedCash" THEN
  RAISE EXCEPTION 'closing snapshot must match exact immutable operation and complete ledger' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_closing_validation BEFORE INSERT ON "CashClosing" FOR EACH ROW EXECUTE FUNCTION public.validate_cash_closing();
CREATE FUNCTION public.derive_cash_closing() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE totals record; actor_name text;
BEGIN
 IF NEW.kind<>'CLOSE' THEN RETURN NULL; END IF;
 SELECT * INTO totals FROM public.cash_shift_summary(NEW."organizationId",NEW."shiftId");
 SELECT "displayName" INTO actor_name FROM public."CompanyUser" WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 INSERT INTO public."CashClosing"(id,"organizationId","locationId","shiftId","cashOperationId","shiftVersion","closedByUserId","closedByDisplayName","closedAt",
  "expectedCash","countedCash",difference,"cashCollected","cashRefunded","cardCollected","cardRefunded","cardNet","paidOrderCount","refundOperationCount","discrepancyReason","managerReason")
 VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."shiftId",NEW.id,NEW."cashShiftVersion",NEW."actorUserId",actor_name,NEW."createdAt",
  totals."expectedCash",NEW."countedCash",NEW."countedCash"-totals."expectedCash",totals."cashCollected",totals."cashRefunded",totals."cardCollected",totals."cardRefunded",totals."cardNet",
  totals."paidOrderCount",totals."refundOperationCount",NEW."discrepancyReason",NEW."managerReason");
 RETURN NULL;
END $$;
-- AFTER trigger ordering: cash_operation_activity sets CLOSED first, then cash_zz_closing captures summary.
CREATE TRIGGER cash_zz_closing AFTER INSERT ON "CashOperation" FOR EACH ROW EXECUTE FUNCTION public.derive_cash_closing();
CREATE FUNCTION public.check_cash_shift_effect() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public."CashShift"; a public."CashShiftActivity"; totals record;
BEGIN
 SELECT * INTO s FROM public."CashShift" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO a FROM public."CashShiftActivity" WHERE "organizationId"=NEW."organizationId" AND id=NEW."lastActivityId";
 SELECT * INTO totals FROM public.cash_shift_summary(NEW."organizationId",NEW.id);
 IF s.id IS NULL OR to_jsonb(s) IS DISTINCT FROM to_jsonb(NEW) OR a.id IS NULL
  OR (a."locationId",a."shiftId",a."shiftVersion") IS DISTINCT FROM (NEW."locationId",NEW.id,NEW.version)
  OR (TG_OP='INSERT' AND a.kind<>'OPEN')
  OR (NEW.status='CLOSED' AND (a.kind<>'CLOSE' OR NOT EXISTS (SELECT 1 FROM public."CashClosing" c
   WHERE c."organizationId"=NEW."organizationId" AND c."shiftId"=NEW.id AND c."cashOperationId"=a."cashOperationId" AND c."shiftVersion"=NEW.version)))
  OR totals."expectedCash"<0 OR totals."expectedCash" IS DISTINCT FROM NEW."openingAmount"+totals."cashCollected"-totals."cashRefunded" THEN
  RAISE EXCEPTION 'shift version, exact complete ledger and terminal closing must commit together' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cash_shift_effect_consistency AFTER INSERT OR UPDATE ON "CashShift"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_cash_shift_effect();
CREATE FUNCTION public.check_cash_activity_effect() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."CashShift" s WHERE s."organizationId"=NEW."organizationId" AND s.id=NEW."shiftId"
  AND s."locationId"=NEW."locationId" AND s.version=NEW."shiftVersion" AND s."lastActivityId"=NEW.id) THEN
  RAISE EXCEPTION 'cash activity requires its exact shift mutation' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cash_activity_effect_consistency AFTER INSERT ON "CashShiftActivity"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_cash_activity_effect();
-- Sources always derive movement/claim/activity immediately in the INSERT statement. Immutable records and
-- UNIQUE source identities prevent late additions/replacements; no timestamp cutoff or historical backfill.
-- Old payment_*/checkout_* guards remain installed and still validate every original allocation/event rule.
REVOKE ALL ON FUNCTION public.protect_cash_register_gate(),public.protect_cash_shift(),public.protect_open_cash_register(),public.prepare_cash_header(),
 public.validate_cash_activity(),public.validate_cash_claim(),public.apply_cash_header(),public.validate_cash_allocation(),
 public.validate_cash_movement(),public.derive_cash_movement(),public.validate_cash_closing(),public.derive_cash_closing(),
 public.check_cash_shift_effect(),public.check_cash_activity_effect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_cash_register_gate(uuid,uuid,uuid),public.cash_header_source(uuid,text,uuid),public.cash_shift_summary(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_cash_register_gate(uuid,uuid,uuid),public.cash_header_source(uuid,text,uuid),public.cash_shift_summary(uuid,uuid) TO pos_runtime;
INSERT INTO public."Permission"(key,label,"scopeTypes",delegable) VALUES
 ('cash.shifts.read','Vizualizarea turelor proprii',ARRAY['LOCATION'],true),
 ('cash.shifts.open','Deschiderea turei proprii',ARRAY['LOCATION'],true),
 ('cash.shifts.close','Închiderea turei proprii',ARRAY['LOCATION'],true),
 ('cash.shifts.close-others','Închiderea turelor altor operatori',ARRAY['LOCATION'],true),
 ('cash.reports.read','Vizualizarea rapoartelor de casă',ARRAY['LOCATION'],true);
COMMIT;
