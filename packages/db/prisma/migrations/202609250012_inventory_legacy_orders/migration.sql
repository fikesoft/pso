-- Explicit, one-time classification: historical sends without a recipe snapshot cannot
-- be recalculated safely. New runtime orders cannot create this exception.
BEGIN;
CREATE TABLE "InventoryLegacyOrder" (
 "orderId" uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 reason text NOT NULL DEFAULT 'UNTRACKED_BEFORE_RESERVATIONS'
   CHECK (reason='UNTRACKED_BEFORE_RESERVATIONS'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("organizationId","orderId"),
 FOREIGN KEY ("organizationId","locationId","orderId")
   REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT
);
-- FORCE RLS also applies to the owner. These SELECT policies exist only inside
-- this migration transaction and grant no access to any application identity.
CREATE POLICY inventory_upgrade_read ON "Order" FOR SELECT TO pos_migrator USING (true);
CREATE POLICY inventory_upgrade_read ON "InventoryDocument" FOR SELECT TO pos_migrator USING (true);
CREATE POLICY inventory_upgrade_read ON "InventoryReservation" FOR SELECT TO pos_migrator USING (true);
INSERT INTO "InventoryLegacyOrder" ("orderId","organizationId","locationId")
 SELECT o.id,o."organizationId",o."locationId" FROM "Order" o
 WHERE o.status IN ('OPEN','COMPLETED')
 AND NOT EXISTS (SELECT 1 FROM "InventoryDocument" d
   WHERE d."orderId"=o.id AND d."organizationId"=o."organizationId" AND d.kind='CONSUMPTION')
 AND NOT EXISTS (SELECT 1 FROM "InventoryReservation" r
   WHERE r."orderId"=o.id AND r."organizationId"=o."organizationId");
DROP POLICY inventory_upgrade_read ON "Order";
DROP POLICY inventory_upgrade_read ON "InventoryDocument";
DROP POLICY inventory_upgrade_read ON "InventoryReservation";
ALTER TABLE "InventoryLegacyOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryLegacyOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "InventoryLegacyOrder" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "InventoryLegacyOrder" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT ON "InventoryLegacyOrder" TO pos_runtime;
CREATE TRIGGER legacy_order_immutable BEFORE UPDATE OR DELETE ON "InventoryLegacyOrder"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
COMMIT;
