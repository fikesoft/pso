BEGIN;
-- Read-only analytics: no updates to customer, order, payment or role history.
INSERT INTO "Permission"(key,label,"scopeTypes",delegable) VALUES
 ('customers.analytics.read','Analiza clienților organizației',ARRAY['ORGANIZATION'],true);
CREATE INDEX "Order_organizationId_customerId_id_idx" ON "Order"("organizationId","customerId",id);
CREATE INDEX "Order_organizationId_locationId_customerId_number_idx" ON "Order"("organizationId","locationId","customerId",number);
COMMIT;
