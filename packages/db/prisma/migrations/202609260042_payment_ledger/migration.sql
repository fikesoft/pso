-- Preserve historical checkout-linked payments. New financial commands are independent and immutable.
BEGIN;
CREATE TABLE "PaymentOperation" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "fromStatus" text NOT NULL, "toStatus" text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('COLLECT','REFUND')), "orderVersion" integer NOT NULL CHECK ("orderVersion">1),
 amount numeric(18,2) NOT NULL CHECK (amount>0 AND amount<'Infinity'::numeric),
 currency text NOT NULL CHECK (currency='MDL'), reason text,
 "actorUserId" uuid NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind='COLLECT' AND reason IS NULL) OR (kind='REFUND' AND length(btrim(reason)) BETWEEN 3 AND 500 AND reason IS NOT NULL)),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId","orderId",id),
 UNIQUE ("organizationId","locationId","requestKey"), UNIQUE ("organizationId","orderId","orderVersion"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
ALTER TABLE "Payment" ALTER COLUMN "checkoutId" DROP NOT NULL,
 DROP CONSTRAINT "Payment_organizationId_orderId_key",
 ADD COLUMN "operationId" uuid,
 ADD COLUMN "receivedAmount" numeric(18,2), ADD COLUMN "changeAmount" numeric(18,2),
 ADD CONSTRAINT payment_source CHECK (("checkoutId" IS NOT NULL AND "operationId" IS NULL AND "receivedAmount" IS NULL AND "changeAmount" IS NULL)
  OR ("checkoutId" IS NULL AND "operationId" IS NOT NULL AND amount>0
   AND "receivedAmount" IS NOT NULL AND "receivedAmount">=amount AND "receivedAmount"<'Infinity'::numeric
   AND "changeAmount" IS NOT NULL AND "changeAmount"="receivedAmount"-amount
   AND (method='CASH' OR ("receivedAmount"=amount AND "changeAmount"=0)))),
 ADD CONSTRAINT payment_operation_fk FOREIGN KEY ("organizationId","locationId","orderId","operationId")
  REFERENCES "PaymentOperation"("organizationId","locationId","orderId",id),
 ADD CONSTRAINT payment_scope_unique UNIQUE ("organizationId","locationId","orderId",id),
 ADD CONSTRAINT payment_operation_method_unique UNIQUE ("organizationId","operationId",method);
CREATE INDEX "Payment_organizationId_orderId_idx" ON "Payment"("organizationId","orderId");
CREATE TABLE "PaymentRefund" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 "operationId" uuid NOT NULL, "paymentId" uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK (amount>0 AND amount<'Infinity'::numeric),
 currency text NOT NULL CHECK (currency='MDL'), method text NOT NULL CHECK (method IN ('CASH','CARD')),
 "actorUserId" uuid NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","operationId","paymentId"),
 FOREIGN KEY ("organizationId","locationId","orderId","operationId") REFERENCES "PaymentOperation"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","locationId","orderId","paymentId") REFERENCES "Payment"("organizationId","locationId","orderId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE INDEX "PaymentRefund_organizationId_orderId_idx" ON "PaymentRefund"("organizationId","orderId");
CREATE INDEX "PaymentRefund_organizationId_paymentId_idx" ON "PaymentRefund"("organizationId","paymentId");

CREATE FUNCTION public.order_net_paid(org_id uuid, order_id uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT sum(amount) FROM public."Payment" WHERE "organizationId"=org_id AND "orderId"=order_id),0)
 -coalesce((SELECT sum(amount) FROM public."PaymentRefund" WHERE "organizationId"=org_id AND "orderId"=order_id),0)
$$;
REVOKE ALL ON FUNCTION public.order_net_paid(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_net_paid(uuid,uuid) TO pos_runtime;

CREATE FUNCTION public.payment_state(total_ numeric, collected_ numeric, refunded_ numeric) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT CASE WHEN collected_-refunded_=total_ THEN 'PAID'
  WHEN collected_=0 THEN 'UNPAID' WHEN refunded_>0 AND collected_=refunded_ THEN 'REFUNDED'
  WHEN refunded_>0 THEN 'PARTIALLY_REFUNDED' ELSE 'PARTIALLY_PAID' END
$$;
REVOKE ALL ON FUNCTION public.payment_state(numeric,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_state(numeric,numeric,numeric) TO pos_runtime;

CREATE FUNCTION public.validate_payment_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; net numeric; collected numeric; refunded numeric;
BEGIN
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId" FOR UPDATE;
 net:=public.order_net_paid(NEW."organizationId",NEW."orderId");
 IF public.effective_order_status(o.status,o."kitchenStatus") NOT IN ('CONFIRMED','IN_PROGRESS','READY','COMPLETED')
  OR o.id IS NULL OR NEW."orderVersion" IS DISTINCT FROM o.version+1 OR NEW.currency IS DISTINCT FROM o.currency
  OR EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId" AND mode='DEMO')
  OR (NEW.kind='COLLECT' AND NEW.amount>o.total-net) OR (NEW.kind='REFUND' AND NEW.amount>net) THEN
  RAISE EXCEPTION 'payment operation requires the current confirmed order version and available balance' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(amount),0) INTO collected FROM public."Payment" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId";
 SELECT coalesce(sum(amount),0) INTO refunded FROM public."PaymentRefund" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId";
 NEW."fromStatus":=public.payment_state(o.total,collected,refunded);
 NEW."toStatus":=public.payment_state(o.total,collected+CASE WHEN NEW.kind='COLLECT' THEN NEW.amount ELSE 0 END,
  refunded+CASE WHEN NEW.kind='REFUND' THEN NEW.amount ELSE 0 END);
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER payment_operation_creation BEFORE INSERT ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.validate_payment_operation();

CREATE OR REPLACE FUNCTION public.validate_manual_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public."Checkout"; op public."PaymentOperation"; op_xmin xid; allocated numeric;
BEGIN
 IF NEW."checkoutId" IS NOT NULL THEN
  SELECT * INTO c FROM public."Checkout" WHERE id=NEW."checkoutId" AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  IF c.mode IS DISTINCT FROM 'MANUAL' OR (NEW."orderId",NEW.amount,NEW.currency,NEW.method,NEW."confirmedByUserId")
    IS DISTINCT FROM (c."orderId",c.total,c.currency,c.method,c."createdByUserId") THEN
   RAISE EXCEPTION 'manual payment must match its checkout and confirming cashier' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO op FROM public."PaymentOperation" WHERE id=NEW."operationId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
  SELECT xmin INTO op_xmin FROM public."PaymentOperation" WHERE id=op.id;
  SELECT coalesce(sum(amount),0) INTO allocated FROM public."Payment" WHERE "operationId"=op.id AND "organizationId"=op."organizationId";
  IF op.kind IS DISTINCT FROM 'COLLECT' OR op_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR (NEW."orderId",NEW."locationId",NEW.currency,NEW."confirmedByUserId") IS DISTINCT FROM (op."orderId",op."locationId",op.currency,op."actorUserId")
   OR allocated+NEW.amount>op.amount THEN
   RAISE EXCEPTION 'payment must belong to its atomic collection and confirming actor' USING ERRCODE='23514';
  END IF;
  NEW."createdAt":=statement_timestamp();
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.validate_payment_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."PaymentOperation"; p public."Payment"; op_xmin xid; refunded numeric; allocated numeric;
BEGIN
 SELECT * INTO op FROM public."PaymentOperation" WHERE id=NEW."operationId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
 SELECT xmin INTO op_xmin FROM public."PaymentOperation" WHERE id=op.id;
 SELECT * INTO p FROM public."Payment" WHERE id=NEW."paymentId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO refunded FROM public."PaymentRefund" WHERE "organizationId"=NEW."organizationId" AND "paymentId"=p.id;
 SELECT coalesce(sum(amount),0) INTO allocated FROM public."PaymentRefund" WHERE "organizationId"=NEW."organizationId" AND "operationId"=op.id;
 IF op.kind IS DISTINCT FROM 'REFUND' OR op_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR (NEW."orderId",NEW."locationId",NEW.currency,NEW."actorUserId") IS DISTINCT FROM (op."orderId",op."locationId",op.currency,op."actorUserId")
  OR (NEW."orderId",NEW."locationId",NEW.currency,NEW.method) IS DISTINCT FROM (p."orderId",p."locationId",p.currency,p.method)
  OR p.id IS NULL OR NEW.amount+refunded>p.amount OR NEW.amount+allocated>op.amount THEN
  RAISE EXCEPTION 'refund requires its atomic command and the remaining original payment' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER payment_refund_creation BEFORE INSERT ON "PaymentRefund" FOR EACH ROW EXECUTE FUNCTION public.validate_payment_refund();

CREATE FUNCTION public.check_payment_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."PaymentOperation"; o public."Order"; allocated numeric; net numeric;
BEGIN
 IF TG_TABLE_NAME='PaymentOperation' THEN op:=NEW;
 ELSE SELECT * INTO op FROM public."PaymentOperation" WHERE id=NEW."operationId" AND "organizationId"=NEW."organizationId"; END IF;
 IF op.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public."Order" WHERE id=op."orderId" AND "organizationId"=op."organizationId";
 IF op.kind='COLLECT' THEN SELECT coalesce(sum(amount),0) INTO allocated FROM public."Payment" WHERE "organizationId"=op."organizationId" AND "operationId"=op.id;
 ELSE SELECT coalesce(sum(amount),0) INTO allocated FROM public."PaymentRefund" WHERE "organizationId"=op."organizationId" AND "operationId"=op.id; END IF;
 net:=public.order_net_paid(op."organizationId",op."orderId");
 IF allocated<>op.amount OR o.version IS DISTINCT FROM op."orderVersion" OR o."updatedByUserId" IS DISTINCT FROM op."actorUserId"
  OR net<0 OR net>o.total OR NOT EXISTS (
   SELECT 1 FROM public."OrderStatusEvent" e WHERE e."organizationId"=op."organizationId" AND e."locationId"=op."locationId" AND e."orderId"=op."orderId"
    AND e.kind='PAYMENT' AND e."requestKey"=op."requestKey" AND e."requestHash"=op."requestHash" AND e."orderVersion"=op."orderVersion"
    AND e."fromStatus"=op."fromStatus" AND e."toStatus"=op."toStatus"
    AND e."actorUserId"=op."actorUserId" AND e.reason IS NOT DISTINCT FROM op.reason AND e.xmin=pg_current_xact_id()::text::xid
  ) THEN RAISE EXCEPTION 'financial command, exact allocations, order version and payment event must commit together' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_operation_consistency AFTER INSERT ON "PaymentOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_payment_operation();
CREATE CONSTRAINT TRIGGER independent_payment_consistency AFTER INSERT ON "Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_payment_operation();
CREATE CONSTRAINT TRIGGER refund_consistency AFTER INSERT ON "PaymentRefund" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_payment_operation();

CREATE TRIGGER payment_operation_immutable BEFORE UPDATE OR DELETE ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER payment_refund_immutable BEFORE UPDATE OR DELETE ON "PaymentRefund" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['PaymentOperation','PaymentRefund'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_payment_operation(),public.validate_payment_refund(),public.check_payment_operation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_order_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE old_state text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW."kitchenStatus"<>'NOT_SENT' OR NEW.version<>1 THEN
   RAISE EXCEPTION 'orders begin as unsent drafts' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 old_state:=public.effective_order_status(OLD.status,OLD."kitchenStatus");
 IF NEW.version=OLD.version+1 AND NEW.status=old_state AND NEW."kitchenStatus"=public.effective_kitchen_status(OLD."kitchenStatus")
  AND (to_jsonb(NEW)-ARRAY['status','kitchenStatus','version','updatedByUserId','updatedAt'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','kitchenStatus','version','updatedByUserId','updatedAt'])
  AND EXISTS (SELECT 1 FROM public."PaymentOperation" op WHERE op."organizationId"=NEW."organizationId"
   AND op."locationId"=NEW."locationId" AND op."orderId"=NEW.id AND op."orderVersion"=NEW.version
   AND op."actorUserId"=NEW."updatedByUserId" AND op.xmin=pg_current_xact_id()::text::xid) THEN
  RETURN NEW;
 END IF;
 IF NEW.version<>OLD.version+1 OR NEW.status='OPEN' OR NEW."kitchenStatus"='NEW'
  OR (to_jsonb(NEW)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','serviceType','tableLabel','notes','total','version','kitchenStatus','updatedByUserId','updatedAt'])
  OR (OLD.status<>'DRAFT' AND
   (to_jsonb(NEW)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','version','kitchenStatus','updatedByUserId','updatedAt']))
  OR NOT (CASE old_state
   WHEN 'DRAFT' THEN NEW.status IN ('DRAFT','CONFIRMED','CANCELLED')
   WHEN 'CONFIRMED' THEN NEW.status IN ('CONFIRMED','IN_PROGRESS','CANCELLED')
   WHEN 'IN_PROGRESS' THEN NEW.status IN ('IN_PROGRESS','READY','CANCELLED')
   WHEN 'READY' THEN NEW.status IN ('COMPLETED','CANCELLED')
   ELSE false END) THEN
  RAISE EXCEPTION 'invalid order transition or immutable snapshot mutation' USING ERRCODE='23514';
 END IF;
 IF NEW.status='CANCELLED' AND (
  public.order_net_paid(NEW."organizationId",NEW.id)>0
  OR EXISTS (SELECT 1 FROM public."InventoryDocument" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW.id AND kind='CONSUMPTION')
 ) THEN RAISE EXCEPTION 'cancellation must not erase a payment or recorded consumption' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION public.validate_checkout_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; company_name text; location_name text; location_code text; cashier_name text;
BEGIN
 SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId" AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
 IF EXISTS (SELECT 1 FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId") THEN
  RAISE EXCEPTION 'orders with financial history use independent payments and completion' USING ERRCODE='23514';
 END IF;
 IF public.effective_order_status(order_row.status,order_row."kitchenStatus") IS DISTINCT FROM 'READY'
  OR NEW.total IS DISTINCT FROM order_row.total OR NEW.currency IS DISTINCT FROM order_row.currency THEN
  RAISE EXCEPTION 'checkout requires a ready order and its exact total' USING ERRCODE='23514';
 END IF;
 SELECT name INTO company_name FROM public."Organization" WHERE id=NEW."organizationId";
 SELECT name,code INTO location_name,location_code FROM public."Location" WHERE id=NEW."locationId" AND "organizationId"=NEW."organizationId";
 SELECT "displayName" INTO cashier_name FROM public."CompanyUser" WHERE id=NEW."createdByUserId" AND "organizationId"=NEW."organizationId";
 IF (NEW."companyName",NEW."locationName",NEW."locationCode",NEW."cashierName") IS DISTINCT FROM (company_name,location_name,location_code,cashier_name) THEN
  RAISE EXCEPTION 'receipt snapshots must match the organization location and cashier' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_checkout_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_id uuid; org_id uuid; order_row public."Order";
  checkout_row public."Checkout"; payment_row public."Payment";
BEGIN
  org_id := NEW."organizationId";
  IF TG_TABLE_NAME='Order' THEN order_id := NEW.id;
  ELSE order_id := NEW."orderId";
  END IF;
  SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
  SELECT * INTO checkout_row FROM public."Checkout" WHERE "orderId"=order_id AND "organizationId"=org_id;
  IF checkout_row.id IS NULL THEN
    IF order_row.status='COMPLETED' AND NOT EXISTS (
      SELECT 1 FROM public."OrderStatusEvent" e
      WHERE e."organizationId"=org_id AND e."locationId"=order_row."locationId" AND e."orderId"=order_id
        AND e.kind='ORDER' AND e."fromStatus"='READY' AND e."toStatus"='COMPLETED'
        AND e."requestKey" IS NOT NULL AND e."orderVersion"<=order_row.version
    ) THEN
      RAISE EXCEPTION 'completion requires an immutable checkout or operational completion event' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  IF order_row.status IS DISTINCT FROM 'COMPLETED' OR order_row."kitchenStatus" IS DISTINCT FROM 'READY'
    OR checkout_row.total IS DISTINCT FROM order_row.total OR checkout_row.currency IS DISTINCT FROM order_row.currency
    OR checkout_row."locationId" IS DISTINCT FROM order_row."locationId" THEN
    RAISE EXCEPTION 'checkout and order completion must commit together' USING ERRCODE='23514';
  END IF;
  SELECT * INTO payment_row FROM public."Payment"
    WHERE "checkoutId"=checkout_row.id AND "organizationId"=org_id;
  IF (checkout_row.mode='DEMO' AND payment_row.id IS NOT NULL)
    OR (checkout_row.mode='MANUAL' AND payment_row.id IS NULL)
    OR (payment_row.id IS NOT NULL AND
      (payment_row."orderId",payment_row."locationId",payment_row.amount,payment_row.currency,payment_row.method,payment_row."confirmedByUserId")
      IS DISTINCT FROM
      (checkout_row."orderId",checkout_row."locationId",checkout_row.total,checkout_row.currency,checkout_row.method,checkout_row."createdByUserId")) THEN
    RAISE EXCEPTION 'demo has no payment and manual checkout has one exact payment' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;


CREATE FUNCTION public.validate_payment_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."PaymentOperation"; op_xmin xid;
BEGIN
 SELECT * INTO op FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey";
 SELECT xmin INTO op_xmin FROM public."PaymentOperation" WHERE id=op.id;
 IF op.id IS NULL OR op_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR (NEW."orderId",NEW."actorUserId",NEW."requestHash",NEW."orderVersion",NEW."fromStatus",NEW."toStatus",NEW.reason)
   IS DISTINCT FROM (op."orderId",op."actorUserId",op."requestHash",op."orderVersion",op."fromStatus",op."toStatus",op.reason) THEN
  RAISE EXCEPTION 'payment timeline event must match its atomic financial command' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER payment_event_creation BEFORE INSERT ON "OrderStatusEvent" FOR EACH ROW WHEN (NEW.kind='PAYMENT') EXECUTE FUNCTION public.validate_payment_event();
REVOKE ALL ON FUNCTION public.validate_payment_event() FROM PUBLIC;
COMMIT;
