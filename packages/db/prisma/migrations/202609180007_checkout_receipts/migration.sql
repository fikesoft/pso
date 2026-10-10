-- Non-fiscal finalization and manually confirmed payments are separate immutable records.
-- Historical COMPLETED fixtures are not backfilled with invented payments or receipts.
BEGIN;

CREATE TABLE "Checkout" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "orderId" uuid NOT NULL,
  "requestKey" uuid NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  mode text NOT NULL CHECK (mode IN ('DEMO','MANUAL')),
  method text CHECK (method IN ('CASH','CARD')),
  currency text NOT NULL DEFAULT 'MDL' CHECK (currency='MDL'),
  total numeric(18,2) NOT NULL CHECK (total>=0 AND total<'Infinity'::numeric),
  "receivedAmount" numeric(18,2),
  "changeAmount" numeric(18,2),
  "companyName" text NOT NULL,
  "locationName" text NOT NULL,
  "locationCode" text NOT NULL,
  "cashierName" text NOT NULL,
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT checkout_mode_amounts CHECK (
    (mode='DEMO' AND method IS NULL AND "receivedAmount" IS NULL AND "changeAmount" IS NULL)
    OR (mode='MANUAL' AND method IS NOT NULL AND "receivedAmount" IS NOT NULL AND "changeAmount" IS NOT NULL
      AND "receivedAmount">=0 AND "receivedAmount"<'Infinity'::numeric
      AND "changeAmount">=0 AND "changeAmount"<'Infinity'::numeric
      AND ((method='CASH' AND "receivedAmount">=total AND "changeAmount"="receivedAmount"-total)
        OR (method='CARD' AND "receivedAmount"=total AND "changeAmount"=0)))
  ),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","orderId"),
  UNIQUE ("organizationId","locationId","requestKey"),
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);

CREATE TABLE "Payment" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "checkoutId" uuid NOT NULL,
  "orderId" uuid NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount>=0 AND amount<'Infinity'::numeric),
  currency text NOT NULL DEFAULT 'MDL' CHECK (currency='MDL'),
  method text NOT NULL CHECK (method IN ('CASH','CARD')),
  origin text NOT NULL DEFAULT 'MANUAL' CHECK (origin='MANUAL'),
  "confirmedByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","checkoutId"),
  UNIQUE ("organizationId","orderId"),
  FOREIGN KEY ("organizationId","locationId","checkoutId") REFERENCES "Checkout"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","confirmedByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "Payment_organizationId_locationId_createdAt_idx"
  ON "Payment"("organizationId","locationId","createdAt");

CREATE FUNCTION public.validate_checkout_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; company_name text; location_name text; location_code text; cashier_name text;
BEGIN
  SELECT * INTO order_row FROM public."Order" WHERE id=NEW."orderId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR UPDATE;
  IF order_row.status IS DISTINCT FROM 'OPEN' OR order_row."kitchenStatus" IS DISTINCT FROM 'READY'
    OR NEW.total IS DISTINCT FROM order_row.total OR NEW.currency IS DISTINCT FROM order_row.currency THEN
    RAISE EXCEPTION 'checkout requires an open ready order and its exact total' USING ERRCODE='23514';
  END IF;
  SELECT name INTO company_name FROM public."Organization" WHERE id=NEW."organizationId";
  SELECT name,code INTO location_name,location_code FROM public."Location"
    WHERE id=NEW."locationId" AND "organizationId"=NEW."organizationId";
  SELECT "displayName" INTO cashier_name FROM public."CompanyUser"
    WHERE id=NEW."createdByUserId" AND "organizationId"=NEW."organizationId";
  IF (NEW."companyName",NEW."locationName",NEW."locationCode",NEW."cashierName")
      IS DISTINCT FROM (company_name,location_name,location_code,cashier_name) THEN
    RAISE EXCEPTION 'receipt snapshots must match the organization location and cashier' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkout_creation BEFORE INSERT ON "Checkout"
  FOR EACH ROW EXECUTE FUNCTION public.validate_checkout_creation();

CREATE FUNCTION public.validate_manual_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE checkout_row public."Checkout";
BEGIN
  SELECT * INTO checkout_row FROM public."Checkout" WHERE id=NEW."checkoutId"
    AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
  IF checkout_row.mode IS DISTINCT FROM 'MANUAL'
    OR (NEW."orderId",NEW.amount,NEW.currency,NEW.method,NEW."confirmedByUserId")
       IS DISTINCT FROM (checkout_row."orderId",checkout_row.total,checkout_row.currency,checkout_row.method,checkout_row."createdByUserId") THEN
    RAISE EXCEPTION 'manual payment must match its checkout and confirming cashier' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_creation BEFORE INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION public.validate_manual_payment();

CREATE TRIGGER checkout_immutable BEFORE UPDATE OR DELETE ON "Checkout"
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.check_checkout_consistency() RETURNS trigger
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
    IF order_row.status='COMPLETED' THEN
      RAISE EXCEPTION 'completion requires an immutable checkout' USING ERRCODE='23514';
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
CREATE CONSTRAINT TRIGGER order_checkout_consistency AFTER INSERT OR UPDATE ON "Order"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_checkout_consistency();
CREATE CONSTRAINT TRIGGER checkout_consistency AFTER INSERT ON "Checkout"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_checkout_consistency();
CREATE CONSTRAINT TRIGGER payment_checkout_consistency AFTER INSERT ON "Payment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_checkout_consistency();

ALTER TABLE "Checkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Checkout" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "Checkout" TO pos_runtime
  USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "Payment" TO pos_runtime
  USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "Checkout","Payment" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "Checkout","Payment" TO pos_runtime;
REVOKE ALL ON FUNCTION public.validate_checkout_creation(),public.validate_manual_payment(),public.check_checkout_consistency() FROM PUBLIC;

COMMIT;
