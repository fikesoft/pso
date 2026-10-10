BEGIN;
CREATE FUNCTION public.notify_kitchen_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_notify('pos_kitchen_changed',json_build_object(
  'organizationId',NEW."organizationId",'locationId',NEW."locationId")::text);
 RETURN NULL;
END $$;
-- PostgreSQL releases notifications only after a successful transaction commit.
CREATE TRIGGER kitchen_live_ticket AFTER INSERT OR UPDATE ON "KitchenTicket"
 FOR EACH ROW EXECUTE FUNCTION public.notify_kitchen_change();
CREATE TRIGGER kitchen_live_order AFTER UPDATE ON "Order"
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status
  OR OLD."kitchenStatus" IS DISTINCT FROM NEW."kitchenStatus"
  OR OLD."tableLabel" IS DISTINCT FROM NEW."tableLabel"
  OR OLD."tableVisitId" IS DISTINCT FROM NEW."tableVisitId")
 EXECUTE FUNCTION public.notify_kitchen_change();
CREATE TRIGGER kitchen_live_station AFTER INSERT OR UPDATE ON "KitchenStation"
 FOR EACH ROW EXECUTE FUNCTION public.notify_kitchen_change();
CREATE TRIGGER kitchen_live_visit AFTER UPDATE ON "TableVisit"
 FOR EACH ROW EXECUTE FUNCTION public.notify_kitchen_change();
REVOKE ALL ON FUNCTION public.notify_kitchen_change() FROM PUBLIC;
COMMIT;
