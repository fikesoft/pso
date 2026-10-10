BEGIN;
CREATE OR REPLACE FUNCTION public.snapshot_order_event_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; order_xmin xid;
BEGIN
 SELECT * INTO o FROM public."Order" WHERE id=NEW."orderId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
 IF o.id IS NULL OR (NEW."orderVersion" IS NOT NULL AND NEW."orderVersion"<>o.version) THEN
  RAISE EXCEPTION 'order event snapshot requires the current scoped order version' USING ERRCODE='23514';
 END IF;
 SELECT xmin INTO order_xmin FROM public."Order" WHERE id=o.id;
 IF NEW.kind IN ('ORDER','KITCHEN') THEN
  IF order_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid
   OR NEW."actorUserId" IS DISTINCT FROM o."updatedByUserId"
   OR (NEW.kind='ORDER' AND NEW."toStatus" IS DISTINCT FROM public.effective_order_status(o.status,o."kitchenStatus"))
   OR (NEW.kind='ORDER' AND NEW."fromStatus" IS NULL AND
    (o.version<>1 OR NEW."toStatus"<>'DRAFT' OR NEW."actorUserId" IS DISTINCT FROM o."createdByUserId"))
   OR (NEW.kind='KITCHEN' AND NEW."toStatus" IS DISTINCT FROM public.effective_kitchen_status(o."kitchenStatus") AND NOT (
    NEW."toStatus"='CANCELLED' AND o.status='CANCELLED' AND EXISTS (
     SELECT 1 FROM public."KitchenTicket" k WHERE k."organizationId"=o."organizationId"
      AND k."locationId"=o."locationId" AND k."orderId"=o.id AND k.status='CANCELLED'
      AND k."updatedByUserId"=NEW."actorUserId" AND k.xmin=pg_current_xact_id()::text::xid
    ))) THEN
   RAISE EXCEPTION 'order timeline event requires its atomic state and actor' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser"
  WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 IF NEW."actorDisplayName" IS NULL THEN
  RAISE EXCEPTION 'order event requires its tenant actor' USING ERRCODE='23514';
 END IF;
 NEW."orderVersion":=o.version;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE UNIQUE INDEX order_event_version_kind_unique ON "OrderStatusEvent"("organizationId","orderId","orderVersion",kind)
 WHERE "orderVersion" IS NOT NULL;
COMMIT;
