BEGIN;
LOCK TABLE "KitchenTicketItem","OrderItem","Product","Category" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "KitchenTicketItem" ADD COLUMN "productId" uuid;
ALTER TABLE "KitchenTicketItem" ADD COLUMN "categoryId" uuid;
ALTER TABLE "KitchenTicketItem" ADD COLUMN "categorySnapshotKnown" boolean NOT NULL DEFAULT false;
-- The immutable order item proves the historical product. Its historical category
-- is not recoverable from today's catalog: leave it explicitly unknown for old tickets.
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicketItem','OrderItem','Product','Category'] LOOP
  EXECUTE format('CREATE POLICY migration_alert_backfill ON %I TO %I USING (true) WITH CHECK (true)',rel,current_user);
 END LOOP;
END $$;
DROP TRIGGER kitchen_item_immutable ON "KitchenTicketItem";
UPDATE "KitchenTicketItem" ki SET "productId"=oi."productId" FROM "OrderItem" oi
 WHERE oi."organizationId"=ki."organizationId" AND oi."locationId"=ki."locationId" AND oi.id=ki."orderItemId";
ALTER TABLE "KitchenTicketItem" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "KitchenTicketItem" ADD FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id);
ALTER TABLE "KitchenTicketItem" ADD FOREIGN KEY ("organizationId","categoryId") REFERENCES "Category"("organizationId",id);
CREATE TRIGGER kitchen_item_immutable BEFORE UPDATE OR DELETE ON "KitchenTicketItem"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['KitchenTicketItem','OrderItem','Product','Category'] LOOP
  EXECUTE format('DROP POLICY migration_alert_backfill ON %I',rel);
 END LOOP;
END $$;
CREATE FUNCTION public.seal_kitchen_alert_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT p.id,p."categoryId" INTO NEW."productId",NEW."categoryId" FROM public."OrderItem" oi
  JOIN public."Product" p ON p."organizationId"=oi."organizationId" AND p.id=oi."productId"
  WHERE oi."organizationId"=NEW."organizationId" AND oi."locationId"=NEW."locationId"
   AND oi.id=NEW."orderItemId" FOR SHARE OF p;
 IF NEW."productId" IS NULL THEN
  RAISE EXCEPTION 'kitchen alert identity requires the order product' USING ERRCODE='23514';
 END IF;
 NEW."categorySnapshotKnown":=true;
 RETURN NEW;
END $$;
CREATE TRIGGER kitchen_alert_identity BEFORE INSERT ON "KitchenTicketItem"
 FOR EACH ROW EXECUTE FUNCTION public.seal_kitchen_alert_identity();
REVOKE ALL ON FUNCTION public.seal_kitchen_alert_identity() FROM PUBLIC;
COMMIT;
