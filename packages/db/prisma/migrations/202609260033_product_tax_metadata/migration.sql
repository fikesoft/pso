BEGIN;
LOCK TABLE public."Product" IN ACCESS EXCLUSIVE MODE;
CREATE POLICY product_tax_upgrade_read ON public."Product" FOR SELECT TO pos_migrator USING (true);
DO $preserve_catalog$
DECLARE before_hash text; after_hash text; row_count bigint;
BEGIN
 SELECT count(*),md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY id),'empty'))
  INTO row_count,before_hash FROM public."Product" p;
 ALTER TABLE public."Product" ADD COLUMN "taxRate" numeric(7,4),
  ADD CONSTRAINT product_tax_rate_range CHECK ("taxRate" IS NULL OR "taxRate" BETWEEN 0 AND 100);
 SELECT md5(coalesce(string_agg((to_jsonb(p)-'taxRate')::text,'' ORDER BY id),'empty'))
  INTO after_hash FROM public."Product" p;
 IF before_hash IS DISTINCT FROM after_hash THEN
  RAISE EXCEPTION 'product tax migration must preserve all existing values';
 END IF;
 RAISE NOTICE 'product tax metadata: % existing product rows preserved',row_count;
END $preserve_catalog$;
DROP POLICY product_tax_upgrade_read ON public."Product";
COMMIT;
