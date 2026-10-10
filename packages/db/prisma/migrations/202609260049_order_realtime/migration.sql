BEGIN;
-- New evidence only. Historical orders are not fabricated into realtime events.
CREATE TABLE "OrderRealtimeEvent" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "orderId" uuid NOT NULL,
 "orderVersion" integer NOT NULL CHECK ("orderVersion">0),
 type text NOT NULL CHECK (type IN ('order.created','order.updated','order.ready','order.cancelled')),
 "amountSnapshot" numeric(18,2) NOT NULL CHECK ("amountSnapshot">=0),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","orderId","orderVersion"),
 FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT
);
CREATE INDEX "OrderRealtimeEvent_organizationId_locationId_createdAt_idx"
 ON "OrderRealtimeEvent"("organizationId","locationId","createdAt");
ALTER TABLE "OrderRealtimeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderRealtimeEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "OrderRealtimeEvent" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "OrderRealtimeEvent" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "OrderRealtimeEvent" TO pos_runtime;
CREATE TRIGGER order_realtime_immutable BEFORE UPDATE OR DELETE ON "OrderRealtimeEvent"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.validate_order_realtime_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; order_xmin xid;
BEGIN
 SELECT * INTO o FROM public."Order" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."orderId";
 SELECT xmin INTO order_xmin FROM public."Order" WHERE id=o.id;
 IF pg_trigger_depth()<2 OR o.id IS NULL OR order_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
  OR (NEW."orderVersion",NEW."amountSnapshot") IS DISTINCT FROM (o.version,o.total)
  OR (NEW.type='order.created' AND o.version<>1)
  OR (NEW.type='order.ready' AND public.effective_order_status(o.status,o."kitchenStatus")<>'READY')
  OR (NEW.type='order.cancelled' AND o.status<>'CANCELLED') THEN
  RAISE EXCEPTION 'realtime evidence requires its automatic atomic order version' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER order_realtime_validation BEFORE INSERT ON "OrderRealtimeEvent"
 FOR EACH ROW EXECUTE FUNCTION public.validate_order_realtime_event();

CREATE FUNCTION public.record_order_realtime_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE event_id uuid; event_type text; new_state text;
BEGIN
 new_state:=public.effective_order_status(NEW.status,NEW."kitchenStatus");
 IF TG_OP='INSERT' THEN event_type:='order.created';
 ELSIF new_state='CANCELLED' AND public.effective_order_status(OLD.status,OLD."kitchenStatus")<>'CANCELLED' THEN event_type:='order.cancelled';
 ELSIF new_state='READY' AND public.effective_order_status(OLD.status,OLD."kitchenStatus")<>'READY' THEN event_type:='order.ready';
 ELSE event_type:='order.updated'; END IF;
 INSERT INTO public."OrderRealtimeEvent"("organizationId","locationId","orderId","orderVersion",type,"amountSnapshot")
 VALUES(NEW."organizationId",NEW."locationId",NEW.id,NEW.version,event_type,NEW.total)
 RETURNING id INTO event_id;
 -- PostgreSQL releases this wakeup only if the entire business transaction commits.
 -- The gateway reloads the immutable event under tenant context; payload is not authority.
 PERFORM pg_notify('pos_order_changed',json_build_object(
  'eventId',event_id,'organizationId',NEW."organizationId",'locationId',NEW."locationId")::text);
 RETURN NULL;
END $$;
CREATE TRIGGER order_realtime_record AFTER INSERT OR UPDATE ON "Order"
 FOR EACH ROW EXECUTE FUNCTION public.record_order_realtime_event();
REVOKE ALL ON FUNCTION public.validate_order_realtime_event(),public.record_order_realtime_event() FROM PUBLIC;
COMMIT;
