BEGIN;
INSERT INTO "Permission"(key,label,"scopeTypes",delegable)
 VALUES('kitchen.alerts.manage','Configurarea pragurilor de alertă în bucătărie',ARRAY['ORGANIZATION','LOCATION'],true);
COMMIT;
