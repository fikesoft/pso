BEGIN;
LOCK TABLE public."OrderItem",public."WebsiteOrderItem" IN ACCESS EXCLUSIVE MODE;
CREATE POLICY order_tax_upgrade_read ON public."OrderItem" FOR SELECT TO pos_migrator USING (true);
CREATE POLICY website_tax_upgrade_read ON public."WebsiteOrderItem" FOR SELECT TO pos_migrator USING (true);
DO $preserve_lines$
DECLARE table_name text; before_hash text; after_hash text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['OrderItem','WebsiteOrderItem'] LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'''' ORDER BY id),''empty'')) FROM public.%I t',table_name) INTO before_hash;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN "taxRateSnapshot" numeric(7,4), ADD CHECK ("taxRateSnapshot" IS NULL OR "taxRateSnapshot" BETWEEN 0 AND 100)',table_name);
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(t)-''taxRateSnapshot'')::text,'''' ORDER BY id),''empty'')) FROM public.%I t',table_name) INTO after_hash;
  IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'tax snapshots must preserve existing order data'; END IF;
 END LOOP;
END $preserve_lines$;
DROP POLICY order_tax_upgrade_read ON public."OrderItem";
DROP POLICY website_tax_upgrade_read ON public."WebsiteOrderItem";
CREATE FUNCTION public.prepare_order_tax_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE snapshot_rate numeric;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."taxRateSnapshot" IS DISTINCT FROM OLD."taxRateSnapshot" THEN
   RAISE EXCEPTION 'retained order line tax snapshot is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='OrderItem' AND (to_jsonb(NEW)->>'sourceWebsiteOrderItemId') IS NOT NULL THEN
  SELECT "taxRateSnapshot" INTO snapshot_rate FROM public."WebsiteOrderItem"
   WHERE id=(to_jsonb(NEW)->>'sourceWebsiteOrderItemId')::uuid AND "organizationId"=NEW."organizationId"
     AND "locationId"=NEW."locationId" AND "productId"=NEW."productId";
  IF NOT FOUND THEN RAISE EXCEPTION 'tax snapshot requires matching website source' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT "taxRate" INTO snapshot_rate FROM public."Product"
   WHERE id=NEW."productId" AND "organizationId"=NEW."organizationId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax snapshot requires matching product' USING ERRCODE='23514'; END IF;
 END IF;
 -- Server-derived snapshot. Existing rows intentionally keep NULL: current tax is not historical evidence.
 NEW."taxRateSnapshot":=snapshot_rate;
 RETURN NEW;
END $$;
CREATE TRIGGER order_tax_snapshot BEFORE INSERT OR UPDATE ON public."OrderItem"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_order_tax_snapshot();
CREATE TRIGGER website_tax_snapshot BEFORE INSERT ON public."WebsiteOrderItem"
 FOR EACH ROW EXECUTE FUNCTION public.prepare_order_tax_snapshot();
REVOKE ALL ON FUNCTION public.prepare_order_tax_snapshot() FROM PUBLIC;
COMMIT;
