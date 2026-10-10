-- Financial headers lock the mutable parent Order. Immutable records need no UPDATE privilege.
BEGIN;
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
  SELECT * INTO op FROM public."PaymentOperation" WHERE id=NEW."operationId" AND "organizationId"=NEW."organizationId";
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


CREATE OR REPLACE FUNCTION public.validate_payment_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public."PaymentOperation"; p public."Payment"; op_xmin xid; refunded numeric; allocated numeric;
BEGIN
 SELECT * INTO op FROM public."PaymentOperation" WHERE id=NEW."operationId" AND "organizationId"=NEW."organizationId";
 SELECT xmin INTO op_xmin FROM public."PaymentOperation" WHERE id=op.id;
 SELECT * INTO p FROM public."Payment" WHERE id=NEW."paymentId" AND "organizationId"=NEW."organizationId";
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

COMMIT;
