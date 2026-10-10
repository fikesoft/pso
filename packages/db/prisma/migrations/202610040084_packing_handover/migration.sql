BEGIN;
-- Existing sessions are historical; every session created after activation is required.
-- ADD COLUMN with a constant default preserves old rows without fake packing commands.
ALTER TABLE public."PackingSession" ADD COLUMN "handoverRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE public."PackingSession" ALTER COLUMN "handoverRequired" SET DEFAULT true;
CREATE FUNCTION public.seal_packing_requirement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW."handoverRequired":=true;
 ELSIF NEW."handoverRequired" IS DISTINCT FROM OLD."handoverRequired" THEN
  RAISE EXCEPTION 'packing requirement is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER packing_requirement BEFORE INSERT OR UPDATE ON public."PackingSession"
 FOR EACH ROW EXECUTE FUNCTION public.seal_packing_requirement();

CREATE FUNCTION public.guard_order_packing() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (public.effective_order_status(NEW.status,NEW."kitchenStatus") IN ('READY','COMPLETED')
   OR NEW."deliveryStatus" IN ('PICKED_UP','DELIVERING','DELIVERED'))
  AND EXISTS(SELECT 1 FROM public."PackingSession" p WHERE p."organizationId"=NEW."organizationId"
   AND p."locationId"=NEW."locationId" AND p."orderId"=NEW.id AND p."handoverRequired" AND p.status<>'READY') THEN
  RAISE EXCEPTION 'handover requires completed packing' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_packing_guard BEFORE UPDATE ON public."Order"
 FOR EACH ROW EXECUTE FUNCTION public.guard_order_packing();

CREATE FUNCTION public.apply_packing_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."handoverRequired" AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='READY' AND NEW."handoverRequired" THEN
   UPDATE public."Order" SET status='READY',version=version+1,"updatedByUserId"=NEW."completedByUserId","updatedAt"=NEW."completedAt"
    WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND id=NEW."orderId"
     AND status='IN_PROGRESS' AND "kitchenStatus"='READY';
   IF NOT FOUND THEN RAISE EXCEPTION 'packing completion requires an in-progress prepared order' USING ERRCODE='23514'; END IF;
   INSERT INTO public."OrderStatusEvent"(id,"organizationId","locationId","orderId",kind,"fromStatus","toStatus","actorUserId","createdAt")
    VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."orderId",'ORDER','IN_PROGRESS','READY',NEW."completedByUserId",NEW."completedAt");
  END IF;
  INSERT INTO public."OrderStatusEvent"(id,"organizationId","locationId","orderId",kind,"fromStatus","toStatus","actorUserId","createdAt")
   VALUES(gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."orderId",'PACKING',OLD.status,NEW.status,NEW."updatedByUserId",NEW."updatedAt");
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER packing_transition AFTER UPDATE ON public."PackingSession"
 FOR EACH ROW EXECUTE FUNCTION public.apply_packing_transition();
CREATE OR REPLACE FUNCTION public.check_order_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed jsonb; order_id uuid; org_id uuid; order_row public."Order";
 ticket_row public."KitchenTicket"; packing public."PackingSession"; item_total numeric; item_count bigint; ticket_count bigint; state_ text; kitchen_ text;
BEGIN
 changed:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 org_id:=(changed->>'organizationId')::uuid;
 IF TG_TABLE_NAME='Order' THEN order_id:=(changed->>'id')::uuid;
 ELSIF TG_TABLE_NAME='KitchenTicketItem' THEN
  SELECT "orderId" INTO order_id FROM public."KitchenTicket" WHERE id=(changed->>'ticketId')::uuid AND "organizationId"=org_id;
 ELSE order_id:=(changed->>'orderId')::uuid; END IF;
 SELECT * INTO order_row FROM public."Order" WHERE id=order_id AND "organizationId"=org_id;
 SELECT coalesce(sum("lineTotal"),0),count(*) INTO item_total,item_count FROM public."OrderItem" WHERE "organizationId"=org_id AND "orderId"=order_id;
 IF order_row.total IS DISTINCT FROM item_total THEN
  RAISE EXCEPTION 'order total must equal rounded line totals' USING ERRCODE='23514';
 END IF;
 SELECT * INTO packing FROM public."PackingSession" WHERE "organizationId"=org_id AND "orderId"=order_id;
 state_:=public.effective_order_status(order_row.status,order_row."kitchenStatus");
 kitchen_:=public.effective_kitchen_status(order_row."kitchenStatus");
 IF (state_ NOT IN ('DRAFT','CANCELLED') AND item_count=0)
  OR NOT (CASE state_
   WHEN 'DRAFT' THEN kitchen_='NOT_SENT'
   WHEN 'CONFIRMED' THEN kitchen_ IN ('NOT_SENT','QUEUED')
   WHEN 'IN_PROGRESS' THEN kitchen_ IN ('PREPARING','PARTIALLY_READY')
    OR (kitchen_='READY' AND coalesce(packing."handoverRequired",false) AND packing.status IN ('WAITING','PACKING'))
   WHEN 'READY' THEN kitchen_='READY' AND (packing.id IS NULL OR NOT packing."handoverRequired" OR packing.status='READY')
   WHEN 'COMPLETED' THEN kitchen_='READY' AND (packing.id IS NULL OR NOT packing."handoverRequired" OR packing.status='READY')
   WHEN 'CANCELLED' THEN true ELSE false END) THEN
  RAISE EXCEPTION 'order stage must agree with its kitchen progress and nonempty contents' USING ERRCODE='23514';
 END IF;
 SELECT * INTO ticket_row FROM public."KitchenTicket" WHERE "organizationId"=org_id AND "orderId"=order_id;
 IF ticket_row.id IS NULL THEN
  IF state_ NOT IN ('DRAFT','CONFIRMED','CANCELLED') OR kitchen_<>'NOT_SENT' THEN
   RAISE EXCEPTION 'sent order requires a kitchen snapshot' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT count(*) INTO ticket_count FROM public."KitchenTicketItem" WHERE "organizationId"=org_id AND "ticketId"=ticket_row.id;
  IF state_='DRAFT' OR item_count=0 OR ticket_count<>item_count OR ticket_row."orderVersion">order_row.version
   OR (state_<>'CANCELLED' AND kitchen_<>public.effective_kitchen_status(ticket_row.status))
   OR ((ticket_row.status='CANCELLED')<>(state_='CANCELLED'))
   OR EXISTS (SELECT 1 FROM public."KitchenTicketItem" ki JOIN public."OrderItem" oi
    ON oi.id=ki."orderItemId" AND oi."organizationId"=ki."organizationId"
    WHERE ki."organizationId"=org_id AND ki."ticketId"=ticket_row.id
     AND (ki.position,ki."productName",ki."productSku",ki.quantity,ki.note)
      IS DISTINCT FROM (oi.position,oi."productName",oi."productSku",oi.quantity,oi.note)) THEN
   RAISE EXCEPTION 'kitchen snapshot must be complete and consistent with its order' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER packing_order_consistency AFTER INSERT OR UPDATE ON public."PackingSession"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_consistency();
REVOKE ALL ON FUNCTION public.seal_packing_requirement(),public.guard_order_packing(),public.apply_packing_transition() FROM PUBLIC;
CREATE FUNCTION public.validate_packing_timeline() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.kind='PACKING' AND NOT EXISTS(SELECT 1 FROM public."PackingSession" p
  WHERE p."organizationId"=NEW."organizationId" AND p."locationId"=NEW."locationId"
   AND p."orderId"=NEW."orderId" AND p."handoverRequired" AND p.status=NEW."toStatus"
   AND p."updatedByUserId"=NEW."actorUserId" AND p.xmin=pg_current_xact_id()::text::xid) THEN
  RAISE EXCEPTION 'packing timeline requires its atomic session transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER packing_timeline_validation BEFORE INSERT ON public."OrderStatusEvent"
 FOR EACH ROW EXECUTE FUNCTION public.validate_packing_timeline();
REVOKE ALL ON FUNCTION public.validate_packing_timeline() FROM PUBLIC;
COMMIT;
