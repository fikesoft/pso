BEGIN;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable)
 VALUES('orders.split','Împărțirea notei și a articolelor',ARRAY['LOCATION'],true);
COMMIT;
