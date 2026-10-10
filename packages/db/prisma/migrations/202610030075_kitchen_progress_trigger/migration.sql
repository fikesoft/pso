BEGIN;
CREATE OR REPLACE FUNCTION public.check_kitchen_batch_progress() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ticket_id uuid; parent public."KitchenTicket"; parent_xmin xid;
BEGIN
 IF TG_TABLE_NAME='KitchenTicket' THEN ticket_id:=NEW.id; ELSE ticket_id:=NEW."ticketId"; END IF;
 SELECT * INTO parent FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId" AND id=ticket_id;
 SELECT xmin INTO parent_xmin FROM public."KitchenTicket" WHERE "organizationId"=NEW."organizationId" AND id=ticket_id;
 IF public.effective_kitchen_status(parent.status) IS DISTINCT FROM public.kitchen_batch_status(NEW."organizationId",ticket_id)
  OR (TG_TABLE_NAME='KitchenTicketBatch' AND parent_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid)
  OR EXISTS (SELECT 1 FROM public."KitchenTicketBatch" WHERE "organizationId"=NEW."organizationId" AND "ticketId"=ticket_id
   AND (status='CANCELLED')<>(parent.status='CANCELLED')) THEN
  RAISE EXCEPTION 'ticket progress requires atomic parent update and all station batches' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
COMMIT;
