-- A retained draft line keeps its selected product and unit price.
-- Repricing/replacing a product requires a new line identity; quantity/note may still change.
CREATE FUNCTION public.protect_order_item_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW."productId",NEW."productName",NEW."productSku",NEW."unitPrice")
     IS DISTINCT FROM (OLD."productId",OLD."productName",OLD."productSku",OLD."unitPrice") THEN
    RAISE EXCEPTION 'retained order line preserves its product and unit price snapshot' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_item_snapshot BEFORE UPDATE ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_snapshot();
REVOKE ALL ON FUNCTION public.protect_order_item_snapshot() FROM PUBLIC;
