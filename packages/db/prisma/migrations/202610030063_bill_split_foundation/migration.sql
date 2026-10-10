BEGIN;
CREATE TABLE "BillSplit" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
 "actorUserId" uuid NOT NULL, "scopeType" text NOT NULL CHECK ("scopeType" IN ('ORDER','VISIT')),
 "targetOrderId" uuid, "targetVisitId" uuid, mode text NOT NULL CHECK (mode IN ('EQUAL','CUSTOM')),
 "partCount" integer NOT NULL CHECK ("partCount" BETWEEN 2 AND 50), "sourceCount" integer NOT NULL CHECK ("sourceCount" BETWEEN 1 AND 100),
 total numeric(18,2) NOT NULL CHECK (total>0), currency text NOT NULL CHECK (currency='MDL'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("scopeType"='ORDER' AND "targetOrderId" IS NOT NULL AND "targetVisitId" IS NULL AND "sourceCount"=1)
  OR ("scopeType"='VISIT' AND "targetOrderId" IS NULL AND "targetVisitId" IS NOT NULL)),
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId","targetOrderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","targetVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE TABLE "BillSplitSource" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL, "orderId" uuid NOT NULL,
 "orderVersion" integer NOT NULL CHECK ("orderVersion">0), amount numeric(18,2) NOT NULL CHECK (amount>0),
 PRIMARY KEY ("organizationId","locationId","splitId","orderId"), UNIQUE ("organizationId","orderId"),
 FOREIGN KEY ("organizationId","locationId","splitId") REFERENCES "BillSplit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id)
);
CREATE TABLE "BillPart" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 1 AND 50), amount numeric(18,2) NOT NULL CHECK (amount>0),
 UNIQUE ("organizationId","locationId",id), UNIQUE ("organizationId","locationId","splitId",id),
 UNIQUE ("organizationId","splitId",position),
 FOREIGN KEY ("organizationId","locationId","splitId") REFERENCES "BillSplit"("organizationId","locationId",id)
);
CREATE TABLE "BillPartAllocation" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL, "partId" uuid NOT NULL, "orderId" uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK (amount>0), PRIMARY KEY ("organizationId","locationId","partId","orderId"),
 FOREIGN KEY ("organizationId","locationId","splitId","partId") REFERENCES "BillPart"("organizationId","locationId","splitId",id),
 FOREIGN KEY ("organizationId","locationId","splitId","orderId") REFERENCES "BillSplitSource"("organizationId","locationId","splitId","orderId")
);
CREATE TABLE "BillOrderGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "orderId" uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0), PRIMARY KEY ("organizationId","locationId","orderId"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id)
);
ALTER TABLE "PaymentOperation" ADD COLUMN "billPartId" uuid,
 ADD CONSTRAINT payment_bill_part_fk FOREIGN KEY ("organizationId","locationId","billPartId") REFERENCES "BillPart"("organizationId","locationId",id),
 ADD CONSTRAINT payment_bill_part_kind CHECK (kind='COLLECT' OR "billPartId" IS NULL);
CREATE INDEX bill_part_payments ON "PaymentOperation"("organizationId","billPartId","orderId") WHERE "billPartId" IS NOT NULL;
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['BillSplit','BillSplitSource','BillPart','BillPartAllocation','BillOrderGate'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',rel);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',rel);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',rel);
  IF rel<>'BillOrderGate' THEN EXECUTE format('CREATE TRIGGER bill_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',rel); END IF;
 END LOOP;
END $$;
GRANT UPDATE(revision) ON "BillOrderGate" TO pos_runtime;
CREATE TRIGGER bill_gate_validation BEFORE INSERT OR UPDATE OR DELETE ON "BillOrderGate" FOR EACH ROW EXECUTE FUNCTION public.protect_table_gate();
CREATE FUNCTION public.prepare_bill_order(org uuid,loc uuid,target uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public."Order" WHERE "organizationId"=org AND "locationId"=loc AND id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scoped bill order required' USING ERRCODE='23514'; END IF;
 INSERT INTO public."BillOrderGate"("organizationId","locationId","orderId",revision) VALUES(org,loc,target,1)
 ON CONFLICT ("organizationId","locationId","orderId") DO UPDATE SET revision="BillOrderGate".revision+1;
END $$;
CREATE FUNCTION public.validate_bill_split() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'bill split requires current scoped actor' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=statement_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER bill_split_validation BEFORE INSERT ON "BillSplit" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_split();
CREATE FUNCTION public.validate_bill_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public."BillSplit"; source_order public."Order"; split_xmin xid;
BEGIN
 SELECT * INTO s FROM public."BillSplit" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."splitId";
 SELECT xmin INTO split_xmin FROM public."BillSplit" WHERE id=s.id;
 IF s.id IS NULL OR split_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
  RAISE EXCEPTION 'bill children belong to their atomic immutable split' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='BillSplitSource' THEN
  PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",NEW."orderId");
  SELECT * INTO source_order FROM public."Order" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId";
  IF source_order.status NOT IN ('CONFIRMED','IN_PROGRESS','READY')
   OR (source_order.version,source_order.total,source_order.currency) IS DISTINCT FROM (NEW."orderVersion",NEW.amount,s.currency)
   OR EXISTS (SELECT 1 FROM public."Payment" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId")
   OR EXISTS (SELECT 1 FROM public."Checkout" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId")
   OR (s."scopeType"='ORDER' AND NEW."orderId"<>s."targetOrderId")
   OR (s."scopeType"='VISIT' AND (source_order."tableVisitId" IS NULL OR source_order."tableVisitId" NOT IN
    (SELECT id FROM public.table_visit_members(s."organizationId",s."locationId",s."targetVisitId")))) THEN
   RAISE EXCEPTION 'bill source requires its exact confirmed unpaid order snapshot' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_source_validation BEFORE INSERT ON "BillSplitSource" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_child();
CREATE TRIGGER bill_part_validation BEFORE INSERT ON "BillPart" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_child();
CREATE TRIGGER bill_allocation_validation BEFORE INSERT ON "BillPartAllocation" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_child();
CREATE FUNCTION public.check_bill_split() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE source_count integer; part_count integer; source_total numeric; part_total numeric;
BEGIN
 SELECT count(*),coalesce(sum(amount),0) INTO source_count,source_total FROM public."BillSplitSource" WHERE "organizationId"=NEW."organizationId" AND "splitId"=NEW.id;
 SELECT count(*),coalesce(sum(amount),0) INTO part_count,part_total FROM public."BillPart" WHERE "organizationId"=NEW."organizationId" AND "splitId"=NEW.id;
 IF (source_count,part_count,source_total,part_total) IS DISTINCT FROM (NEW."sourceCount",NEW."partCount",NEW.total,NEW.total)
  OR EXISTS (SELECT 1 FROM public."BillPart" p WHERE p."organizationId"=NEW."organizationId" AND p."splitId"=NEW.id
   AND (p.position>NEW."partCount" OR p.amount<>(SELECT coalesce(sum(a.amount),0) FROM public."BillPartAllocation" a WHERE a."organizationId"=p."organizationId" AND a."partId"=p.id)
   OR (NEW.mode='EQUAL' AND p.amount<>floor(NEW.total*100/NEW."partCount")/100+CASE WHEN p.position<=mod(NEW.total*100,NEW."partCount") THEN 0.01 ELSE 0 END)))
  OR EXISTS (SELECT 1 FROM public."BillSplitSource" s WHERE s."organizationId"=NEW."organizationId" AND s."splitId"=NEW.id
   AND s.amount<>(SELECT coalesce(sum(a.amount),0) FROM public."BillPartAllocation" a WHERE a."organizationId"=s."organizationId" AND a."splitId"=s."splitId" AND a."orderId"=s."orderId")) THEN
  RAISE EXCEPTION 'bill split requires exact source, part and allocation totals' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bill_split_consistency AFTER INSERT ON "BillSplit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bill_split();
CREATE FUNCTION public.bill_part_order_net(org uuid,part uuid,target uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT sum(p.amount) FROM public."Payment" p JOIN public."PaymentOperation" op ON op.id=p."operationId" AND op."organizationId"=p."organizationId"
  WHERE op."organizationId"=org AND op."billPartId"=part AND op."orderId"=target),0)
 -coalesce((SELECT sum(r.amount) FROM public."PaymentRefund" r JOIN public."Payment" p ON p.id=r."paymentId" AND p."organizationId"=r."organizationId"
  JOIN public."PaymentOperation" op ON op.id=p."operationId" AND op."organizationId"=p."organizationId"
  WHERE op."organizationId"=org AND op."billPartId"=part AND op."orderId"=target),0)
$$;
CREATE FUNCTION public.guard_bill_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE planned boolean; allocation numeric;
BEGIN
 PERFORM public.prepare_bill_order(NEW."organizationId",NEW."locationId",NEW."orderId");
 SELECT EXISTS (SELECT 1 FROM public."BillSplitSource" WHERE "organizationId"=NEW."organizationId" AND "orderId"=NEW."orderId") INTO planned;
 IF TG_TABLE_NAME='Checkout' THEN
  IF planned THEN RAISE EXCEPTION 'split bill requires collection by part' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind='COLLECT' THEN
  IF planned THEN
   SELECT amount INTO allocation FROM public."BillPartAllocation" WHERE "organizationId"=NEW."organizationId"
    AND "locationId"=NEW."locationId" AND "partId"=NEW."billPartId" AND "orderId"=NEW."orderId";
   IF allocation IS NULL OR NEW.amount>allocation-public.bill_part_order_net(NEW."organizationId",NEW."billPartId",NEW."orderId") THEN
    RAISE EXCEPTION 'collection exceeds split part allocation or lacks its part' USING ERRCODE='23514'; END IF;
  ELSIF NEW."billPartId" IS NOT NULL THEN RAISE EXCEPTION 'order has no split part' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_bill_payment BEFORE INSERT ON "PaymentOperation" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_payment();
CREATE TRIGGER q_bill_checkout BEFORE INSERT ON "Checkout" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_payment();
REVOKE ALL ON FUNCTION public.prepare_bill_order(uuid,uuid,uuid),public.validate_bill_split(),public.validate_bill_child(),public.check_bill_split(),public.bill_part_order_net(uuid,uuid,uuid),public.guard_bill_payment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_bill_order(uuid,uuid,uuid),public.bill_part_order_net(uuid,uuid,uuid) TO pos_runtime;
COMMIT;
