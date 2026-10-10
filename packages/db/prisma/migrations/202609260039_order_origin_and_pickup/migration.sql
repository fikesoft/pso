BEGIN;
-- Existing orders intentionally retain unknown origin/brand. A current location is not historical evidence.
ALTER TABLE public."Order"
 ADD COLUMN source text CHECK (source IN ('PHONE','POS','WAITER','WEB','QR','KIOSK','MOBILE_APP','AGGREGATOR','API')),
 ADD COLUMN "brandId" uuid,
 ADD CONSTRAINT order_brand_tenant_fk FOREIGN KEY ("organizationId","brandId") REFERENCES public."Brand"("organizationId",id) ON DELETE RESTRICT;
ALTER TABLE public."Order" ALTER COLUMN source SET DEFAULT 'POS';
ALTER TABLE public."Order" DROP CONSTRAINT "Order_serviceType_check",
 ADD CONSTRAINT "Order_serviceType_check" CHECK ("serviceType" IN ('DINE_IN','TAKEAWAY','DELIVERY','PICKUP'));
CREATE FUNCTION public.prepare_order_origin() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.source IS NULL THEN RAISE EXCEPTION 'new order requires explicit origin' USING ERRCODE='23514'; END IF;
 SELECT "brandId" INTO NEW."brandId" FROM public."Location"
  WHERE id=NEW."locationId" AND "organizationId"=NEW."organizationId" FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order origin requires matching location' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_origin BEFORE INSERT ON public."Order" FOR EACH ROW EXECUTE FUNCTION public.prepare_order_origin();
CREATE FUNCTION public.check_order_channel_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE local_order public."Order"; inbox public."WebsiteOrder";
BEGIN
 IF TG_TABLE_NAME='Order' THEN
  SELECT * INTO local_order FROM public."Order" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
  -- Origin was verified when the order was created. Later edits have their own immutable snapshots.
  IF local_order.source IS DISTINCT FROM 'WEB' THEN RETURN NULL; END IF;
  SELECT * INTO inbox FROM public."WebsiteOrder" WHERE "orderId"=local_order.id AND "organizationId"=local_order."organizationId";
  IF NOT FOUND OR inbox.status<>'ACCEPTED' OR inbox."locationId"<>local_order."locationId" THEN
   RAISE EXCEPTION 'website origin requires accepted matching inbox' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO inbox FROM public."WebsiteOrder" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
  IF inbox.status<>'ACCEPTED' THEN RETURN NULL; END IF;
  SELECT * INTO local_order FROM public."Order" WHERE id=inbox."orderId" AND "organizationId"=inbox."organizationId";
  IF local_order.source IS DISTINCT FROM 'WEB' OR EXISTS (
   SELECT 1 FROM public."WebsiteOrderItem" w LEFT JOIN public."OrderItem" i
    ON i."organizationId"=w."organizationId" AND i."locationId"=w."locationId"
     AND i."orderId"=local_order.id AND i.position=w.position
   WHERE w."websiteOrderId"=inbox.id AND w."organizationId"=inbox."organizationId"
    AND (i."sourceWebsiteOrderItemId" IS DISTINCT FROM w.id OR i."taxRateSnapshot" IS DISTINCT FROM w."taxRateSnapshot")
  ) THEN RAISE EXCEPTION 'website acceptance must preserve origin and tax snapshots' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_channel_source AFTER INSERT ON public."Order"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_channel_source();
CREATE CONSTRAINT TRIGGER website_order_channel_source AFTER INSERT OR UPDATE ON public."WebsiteOrder"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_channel_source();
CREATE FUNCTION public.valid_recipe_service_types(values_ text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
BEGIN
 IF array_ndims(values_) IS DISTINCT FROM 1 OR array_lower(values_,1)<>1 OR cardinality(values_) NOT BETWEEN 1 AND 4 THEN RETURN false; END IF;
 RETURN array_position(values_,NULL) IS NULL AND values_ <@ ARRAY['DINE_IN','TAKEAWAY','DELIVERY','PICKUP']::text[]
  AND cardinality(values_)=(SELECT count(DISTINCT value) FROM unnest(values_) value);
END $$;
ALTER TABLE public."RecipeComponent" DROP CONSTRAINT recipe_services,
 ADD CONSTRAINT recipe_services CHECK (public.valid_recipe_service_types("serviceTypes"));
DO $modifier_services$
DECLARE constraints_ text[]; name_ text;
BEGIN
 SELECT array_agg(conname) INTO constraints_ FROM pg_constraint
 WHERE conrelid='public."ModifierRecipeComponent"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%"serviceTypes"%';
 IF cardinality(constraints_) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'expected one modifier service guard'; END IF;
 FOREACH name_ IN ARRAY constraints_ LOOP EXECUTE format('ALTER TABLE public."ModifierRecipeComponent" DROP CONSTRAINT %I',name_); END LOOP;
END $modifier_services$;
ALTER TABLE public."ModifierRecipeComponent" ADD CONSTRAINT modifier_recipe_services CHECK (public.valid_recipe_service_types("serviceTypes"));
REVOKE ALL ON FUNCTION public.prepare_order_origin(),public.check_order_channel_source(),public.valid_recipe_service_types(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_recipe_service_types(text[]) TO pos_runtime;
COMMIT;
