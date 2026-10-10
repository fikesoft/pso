BEGIN;
CREATE OR REPLACE FUNCTION public.check_bill_items() RETURNS trigger
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
   AND (i.quantity,i.amount) IS DISTINCT FROM (SELECT ROW(coalesce(sum(a.quantity),0),coalesce(sum(a.amount),0))
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
COMMIT;
