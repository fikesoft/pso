BEGIN;
INSERT INTO "Permission" (key,label,"scopeTypes",delegable) VALUES
 ('tables.read','Vizualizarea meselor și vizitelor',ARRAY['LOCATION'],true),
 ('tables.manage','Configurarea meselor',ARRAY['LOCATION'],true),
 ('tables.visits.manage','Deschiderea și administrarea vizitelor',ARRAY['LOCATION'],true),
 ('tables.visits.assign','Schimbarea chelnerului unei vizite',ARRAY['LOCATION'],true)
ON CONFLICT (key) DO NOTHING;
COMMIT;
