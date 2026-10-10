BEGIN;
CREATE TABLE "BillCollection" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "partId" uuid NOT NULL, "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "requestHash" text, amount numeric(18,2), method text, "receivedAmount" numeric(18,2),
 "cashShiftId" uuid, "operationCount" integer, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","requestKey"),
 CHECK ((status='RETIRED' AND "requestHash" IS NULL AND amount IS NULL AND method IS NULL AND "receivedAmount" IS NULL AND "cashShiftId" IS NULL AND "operationCount" IS NULL)
  OR (status='SUCCEEDED' AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$' AND amount IS NOT NULL AND amount>0
   AND method IS NOT NULL AND method IN ('CASH','CARD') AND "receivedAmount" IS NOT NULL AND "receivedAmount">=amount
   AND (method='CASH' OR "receivedAmount"=amount) AND "cashShiftId" IS NOT NULL AND "operationCount" IS NOT NULL AND "operationCount" BETWEEN 1 AND 100)),
 FOREIGN KEY ("organizationId","locationId","partId") REFERENCES "BillPart"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","cashShiftId") REFERENCES "CashShift"("organizationId","locationId",id)
);
ALTER TABLE "BillCollection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillCollection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "BillCollection" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "BillCollection" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "BillCollection" TO pos_runtime;
CREATE TRIGGER bill_collection_immutable BEFORE UPDATE OR DELETE ON "BillCollection" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE "PaymentOperation" ADD COLUMN "billCollectionId" uuid,
 ADD CONSTRAINT payment_bill_collection_fk FOREIGN KEY ("organizationId","locationId","billCollectionId") REFERENCES "BillCollection"("organizationId","locationId",id),
 ADD CONSTRAINT payment_bill_collection_kind CHECK ("billCollectionId" IS NULL OR (kind='COLLECT' AND "billPartId" IS NOT NULL));
CREATE UNIQUE INDEX bill_collection_order ON "PaymentOperation"("organizationId","billCollectionId","orderId") WHERE "billCollectionId" IS NOT NULL;
CREATE FUNCTION public.validate_bill_collection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; remaining numeric; count_due integer;
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'bill collection requires current scoped actor' USING ERRCODE='23514'; END IF;
 FOR target IN SELECT a."orderId" FROM public."BillPartAllocation" a WHERE a."organizationId"=NEW."organizationId" AND a."locationId"=NEW."locationId" AND a."partId"=NEW."partId" ORDER BY a."orderId" LOOP
  PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",target);
 END LOOP;
 IF NEW.status='SUCCEEDED' THEN
  SELECT coalesce(sum(due),0),count(*) FILTER (WHERE due>0) INTO remaining,count_due FROM (
   SELECT a.amount-public.bill_part_order_net(a."organizationId",a."partId",a."orderId") AS due
   FROM public."BillPartAllocation" a WHERE a."organizationId"=NEW."organizationId" AND a."locationId"=NEW."locationId" AND a."partId"=NEW."partId"
  ) balances;
  IF (NEW.amount,NEW."operationCount") IS DISTINCT FROM (remaining,count_due) OR remaining<=0 THEN
   RAISE EXCEPTION 'bill collection requires entire current outstanding part' USING ERRCODE='23514'; END IF;
 END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER bill_collection_validation BEFORE INSERT ON "BillCollection" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_collection();
CREATE FUNCTION public.validate_bill_collection_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public."BillCollection"; parent_xmin xid;
BEGIN
 IF NEW."billCollectionId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public."BillCollection" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."billCollectionId";
 SELECT xmin INTO parent_xmin FROM public."BillCollection" WHERE id=c.id;
 IF c.id IS NULL OR c.status<>'SUCCEEDED' OR parent_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR (NEW."billPartId",NEW."actorUserId",NEW."cashShiftId") IS DISTINCT FROM (c."partId",c."actorUserId",c."cashShiftId") THEN
  RAISE EXCEPTION 'bill operation requires its atomic collection' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r_bill_collection_operation BEFORE INSERT ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_collection_operation();
CREATE FUNCTION public.check_bill_collection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE count_ops integer; total numeric; received numeric;
BEGIN
 IF NEW.status='RETIRED' THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(amount),0) INTO count_ops,total FROM public."PaymentOperation" WHERE "organizationId"=NEW."organizationId" AND "billCollectionId"=NEW.id;
 SELECT coalesce(sum(p."receivedAmount"),0) INTO received FROM public."Payment" p JOIN public."PaymentOperation" op ON (op."organizationId",op.id)=(p."organizationId",p."operationId")
  WHERE op."organizationId"=NEW."organizationId" AND op."billCollectionId"=NEW.id;
 IF (count_ops,total,received) IS DISTINCT FROM (NEW."operationCount",NEW.amount,NEW."receivedAmount")
  OR EXISTS (SELECT 1 FROM public."Payment" p JOIN public."PaymentOperation" op ON (op."organizationId",op.id)=(p."organizationId",p."operationId")
   WHERE op."organizationId"=NEW."organizationId" AND op."billCollectionId"=NEW.id AND p.method<>NEW.method)
  OR EXISTS (SELECT 1 FROM public."BillPartAllocation" a WHERE a."organizationId"=NEW."organizationId" AND a."partId"=NEW."partId"
   AND a.amount<>public.bill_part_order_net(a."organizationId",a."partId",a."orderId")) THEN
  RAISE EXCEPTION 'bill collection requires all exact financial effects' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bill_collection_consistency AFTER INSERT ON "BillCollection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bill_collection();
REVOKE ALL ON FUNCTION public.validate_bill_collection(),public.validate_bill_collection_operation(),public.check_bill_collection() FROM PUBLIC;
COMMIT;
