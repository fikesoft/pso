-- Preserve existing evidence verbatim. A NULL snapshot denotes historical unknown data.
BEGIN;
ALTER TABLE "OrderStatusEvent" ADD COLUMN "actorDisplayName" text;
ALTER TABLE "AuditEvent" ADD COLUMN "actorDisplayName" text,
 ADD COLUMN "orderVersion" integer CHECK ("orderVersion">0);

CREATE FUNCTION public.snapshot_order_event_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order";
BEGIN
 SELECT * INTO o FROM public."Order" WHERE id=NEW."orderId"
  AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId";
 IF o.id IS NULL OR (NEW."orderVersion" IS NOT NULL AND NEW."orderVersion"<>o.version) THEN
  RAISE EXCEPTION 'order event snapshot requires the current scoped order version' USING ERRCODE='23514';
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
-- Financial/delivery/completion validation runs first, retaining its stronger atomic checks.
CREATE TRIGGER z_order_event_snapshot BEFORE INSERT ON "OrderStatusEvent"
 FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_event_actor();

CREATE FUNCTION public.snapshot_draft_audit_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o public."Order"; order_xmin xid;
BEGIN
 SELECT * INTO o FROM public."Order"
  WHERE id::text=NEW."targetId" AND "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId";
 SELECT xmin INTO order_xmin FROM public."Order" WHERE id=o.id;
 IF o.id IS NULL OR o.status<>'DRAFT' OR o.version<2 OR NEW."targetType"<>'ORDER'
  OR NEW.outcome<>'SUCCESS' OR NEW."actorUserId" IS DISTINCT FROM o."updatedByUserId"
  OR order_xmin IS DISTINCT FROM pg_current_xact_id()::text::xid THEN
  RAISE EXCEPTION 'draft edit audit requires its atomic scoped order and actor' USING ERRCODE='23514';
 END IF;
 SELECT "displayName" INTO NEW."actorDisplayName" FROM public."CompanyUser"
  WHERE "organizationId"=NEW."organizationId" AND id=NEW."actorUserId";
 IF NEW."actorDisplayName" IS NULL THEN
  RAISE EXCEPTION 'draft audit requires its tenant actor' USING ERRCODE='23514';
 END IF;
 NEW."orderVersion":=o.version;
 NEW.metadata:=NEW.metadata || jsonb_build_object('previousVersion',o.version-1,'orderVersion',o.version);
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER draft_audit_snapshot BEFORE INSERT ON "AuditEvent" FOR EACH ROW
 WHEN (NEW.action='orders.draft.updated') EXECUTE FUNCTION public.snapshot_draft_audit_actor();
CREATE UNIQUE INDEX draft_audit_version_unique ON "AuditEvent"("organizationId","targetId","orderVersion")
 WHERE action='orders.draft.updated' AND "orderVersion" IS NOT NULL;
CREATE INDEX draft_audit_timeline ON "AuditEvent"("organizationId","locationId","targetId","createdAt",id)
 WHERE action='orders.draft.updated' AND "targetType"='ORDER' AND outcome='SUCCESS';
CREATE INDEX order_event_timeline ON "OrderStatusEvent"("organizationId","locationId","orderId","createdAt",id);
REVOKE ALL ON FUNCTION public.snapshot_order_event_actor(),public.snapshot_draft_audit_actor() FROM PUBLIC;
COMMIT;
