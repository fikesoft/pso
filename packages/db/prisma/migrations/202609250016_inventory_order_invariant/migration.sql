BEGIN;
-- The deferred guard checks the final transaction state, not just reservations that
-- happen to exist. Missing reservations are rejected even through raw runtime SQL.
CREATE OR REPLACE FUNCTION public.check_order_reservation_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE order_row public."Order"; reservation public."InventoryReservation"; historical boolean;
BEGIN
 SELECT * INTO order_row FROM public."Order"
  WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
 SELECT * INTO reservation FROM public."InventoryReservation"
  WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId";
 IF reservation.id IS NOT NULL THEN
  IF (order_row.status='OPEN' AND reservation.status<>'PENDING')
   OR (order_row.status='COMPLETED' AND reservation.status<>'CONSUMED')
   OR (order_row.status='CANCELLED' AND reservation.status<>'RELEASED') THEN
   RAISE EXCEPTION 'order state requires matching inventory reservation resolution' USING ERRCODE='23514';
  END IF;
 ELSIF order_row.status IN ('OPEN','COMPLETED') THEN
  SELECT EXISTS (SELECT 1 FROM public."InventoryDocument"
   WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId" AND kind='CONSUMPTION')
   OR EXISTS (SELECT 1 FROM public."InventoryLegacyOrder"
   WHERE "orderId"=NEW.id AND "organizationId"=NEW."organizationId") INTO historical;
  IF NOT historical THEN
   RAISE EXCEPTION 'sent and completed orders require inventory reservation or immutable historical evidence' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
COMMIT;
