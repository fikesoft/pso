BEGIN;
ALTER TABLE "BillSplit" DROP CONSTRAINT "BillSplit_mode_check",
 ADD CONSTRAINT "BillSplit_mode_check" CHECK (mode IN ('EQUAL','CUSTOM','ITEMS'));
ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_bill_identity UNIQUE ("organizationId","locationId","orderId",id);
CREATE TABLE "BillSplitItem" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL,
 "orderId" uuid NOT NULL, "orderItemId" uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK (quantity>0), amount numeric(18,2) NOT NULL CHECK (amount>=0),
 PRIMARY KEY ("organizationId","locationId","splitId","orderItemId"),
 UNIQUE ("organizationId","locationId","splitId","orderId","orderItemId"),
 FOREIGN KEY ("organizationId","locationId","splitId","orderId") REFERENCES "BillSplitSource"("organizationId","locationId","splitId","orderId"),
 FOREIGN KEY ("organizationId","locationId","orderId","orderItemId") REFERENCES "OrderItem"("organizationId","locationId","orderId",id)
);
CREATE TABLE "BillPartItem" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, "splitId" uuid NOT NULL,
 "partId" uuid NOT NULL, "orderId" uuid NOT NULL, "orderItemId" uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK (quantity>0), amount numeric(18,2) NOT NULL CHECK (amount>=0),
 PRIMARY KEY ("organizationId","locationId","partId","orderItemId"),
 FOREIGN KEY ("organizationId","locationId","splitId","partId") REFERENCES "BillPart"("organizationId","locationId","splitId",id),
 FOREIGN KEY ("organizationId","locationId","splitId","orderId","orderItemId") REFERENCES "BillSplitItem"("organizationId","locationId","splitId","orderId","orderItemId")
);
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['BillSplitItem','BillPartItem'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',rel);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',rel);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',rel);
  EXECUTE format('CREATE TRIGGER bill_item_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation()',rel);
  EXECUTE format('CREATE TRIGGER bill_item_atomic BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.validate_bill_child()',rel);
 END LOOP;
END $$;
CREATE FUNCTION public.validate_bill_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."BillSplit" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."splitId" AND mode='ITEMS') THEN
  RAISE EXCEPTION 'item allocations require an ITEMS split' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='BillSplitItem' AND NOT EXISTS (
  SELECT 1 FROM public."OrderItem" i WHERE (i."organizationId",i."locationId",i."orderId",i.id)
   =(NEW."organizationId",NEW."locationId",NEW."orderId",NEW."orderItemId")
   AND (i.quantity,i."lineTotal")=(NEW.quantity,NEW.amount)) THEN
  RAISE EXCEPTION 'bill item requires exact original snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bill_item_validation BEFORE INSERT ON "BillSplitItem" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_item();
CREATE TRIGGER bill_item_validation BEFORE INSERT ON "BillPartItem" FOR EACH ROW EXECUTE FUNCTION public.validate_bill_item();
CREATE FUNCTION public.check_bill_items() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.mode<>'ITEMS' THEN RETURN NULL; END IF;
 -- Every original line must be included, even when it has a zero price.
 IF EXISTS (SELECT 1 FROM public."BillSplitSource" s JOIN public."OrderItem" i
   ON (i."organizationId",i."locationId",i."orderId")=(s."organizationId",s."locationId",s."orderId")
   WHERE s."organizationId"=NEW."organizationId" AND s."splitId"=NEW.id
   AND NOT EXISTS (SELECT 1 FROM public."BillSplitItem" b WHERE b."organizationId"=s."organizationId"
    AND b."splitId"=s."splitId" AND b."orderItemId"=i.id))
 OR EXISTS (SELECT 1 FROM public."BillSplitSource" s WHERE s."organizationId"=NEW."organizationId" AND s."splitId"=NEW.id
   AND s.amount<>(SELECT coalesce(sum(i.amount),0) FROM public."BillSplitItem" i
    WHERE i."organizationId"=s."organizationId" AND i."splitId"=s."splitId" AND i."orderId"=s."orderId"))
 OR EXISTS (SELECT 1 FROM public."BillSplitItem" i WHERE i."organizationId"=NEW."organizationId" AND i."splitId"=NEW.id
   AND (i.quantity,i.amount) IS DISTINCT FROM (SELECT coalesce(sum(a.quantity),0),coalesce(sum(a.amount),0)
    FROM public."BillPartItem" a WHERE a."organizationId"=i."organizationId" AND a."splitId"=i."splitId" AND a."orderItemId"=i."orderItemId")) THEN
  RAISE EXCEPTION 'bill items require complete exact quantities and totals' USING ERRCODE='23514'; END IF;
 -- Integer div/mod avoids losing precision near numeric(18) boundaries.
 IF EXISTS (WITH shares AS (
  SELECT a.amount,i.amount*100 AS cents,i."orderItemId",p.position,
   div(i.amount*100*a.quantity*1000,i.quantity*1000) AS floor_cents,
   mod(i.amount*100*a.quantity*1000,i.quantity*1000) AS remainder
  FROM public."BillPartItem" a JOIN public."BillSplitItem" i
   ON (i."organizationId",i."locationId",i."splitId",i."orderItemId")=(a."organizationId",a."locationId",a."splitId",a."orderItemId")
  JOIN public."BillPart" p ON (p."organizationId",p."locationId",p.id)=(a."organizationId",a."locationId",a."partId")
  WHERE a."organizationId"=NEW."organizationId" AND a."splitId"=NEW.id
 ), ranked AS (
  SELECT *,sum(floor_cents) OVER (PARTITION BY "orderItemId") AS allocated,
   row_number() OVER (PARTITION BY "orderItemId" ORDER BY remainder DESC,position) AS rank FROM shares
 ) SELECT 1 FROM ranked WHERE amount*100<>floor_cents+CASE WHEN rank<=cents-allocated THEN 1 ELSE 0 END) THEN
  RAISE EXCEPTION 'bill item rounding must use largest remainder and part position' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM public."BillPartAllocation" a WHERE a."organizationId"=NEW."organizationId" AND a."splitId"=NEW.id
   AND a.amount<>(SELECT coalesce(sum(i.amount),0) FROM public."BillPartItem" i
    WHERE (i."organizationId",i."locationId",i."splitId",i."partId",i."orderId")=(a."organizationId",a."locationId",a."splitId",a."partId",a."orderId")))
 OR EXISTS (SELECT 1 FROM public."BillPartItem" i WHERE i."organizationId"=NEW."organizationId" AND i."splitId"=NEW.id AND i.amount>0
   AND NOT EXISTS (SELECT 1 FROM public."BillPartAllocation" a
    WHERE (a."organizationId",a."locationId",a."splitId",a."partId",a."orderId")=(i."organizationId",i."locationId",i."splitId",i."partId",i."orderId"))) THEN
  RAISE EXCEPTION 'bill payment allocations must match item allocations' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bill_items_consistency AFTER INSERT ON "BillSplit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bill_items();
REVOKE ALL ON FUNCTION public.validate_bill_item(),public.check_bill_items() FROM PUBLIC;
COMMIT;
