BEGIN;
-- Keep applied migration 088 immutable; reject whitespace-only and untrimmed names at runtime.
CREATE OR REPLACE FUNCTION public.delivery_zone_profile_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE shape jsonb; hours jsonb; w jsonb; other jsonb; i integer; j integer; v text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k)
  IS DISTINCT FROM ARRAY['activeHours','deliveryFee','estimatedMinutes','freeDeliveryFrom','minimumOrder','name','priority','shape'] THEN RETURN false; END IF;
 IF jsonb_typeof(p->'name')<>'string' OR length(p->>'name') NOT BETWEEN 1 AND 120 OR btrim(p->>'name')<>p->>'name' OR (p->>'name') ~ '^[[:space:]]|[[:space:]]$' THEN RETURN false; END IF;
 FOREACH v IN ARRAY ARRAY['minimumOrder','deliveryFee'] LOOP
  IF jsonb_typeof(p->v)<>'string' OR (p->>v)!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$' THEN RETURN false; END IF;
 END LOOP;
 IF p->'freeDeliveryFrom'<>'null'::jsonb AND (jsonb_typeof(p->'freeDeliveryFrom')<>'string'
  OR (p->>'freeDeliveryFrom')!~'^(0|[1-9][0-9]{0,15})\.[0-9]{2}$'
  OR (p->>'freeDeliveryFrom')::numeric<(p->>'minimumOrder')::numeric) THEN RETURN false; END IF;
 IF jsonb_typeof(p->'estimatedMinutes')<>'number' OR (p->>'estimatedMinutes')!~'^[0-9]+$'
  OR (p->>'estimatedMinutes')::numeric NOT BETWEEN 1 AND 1440
  OR jsonb_typeof(p->'priority')<>'number' OR (p->>'priority')!~'^[0-9]+$' OR (p->>'priority')::numeric NOT BETWEEN 0 AND 999 THEN RETURN false; END IF;
 shape:=p->'shape'; IF jsonb_typeof(shape)<>'object' THEN RETURN false; END IF;
 IF shape->>'type'='RADIUS' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape) k) IS DISTINCT FROM ARRAY['center','radiusMeters','type']
   OR public.delivery_coordinate_valid(shape->'center') IS DISTINCT FROM true OR jsonb_typeof(shape->'radiusMeters')<>'number'
   OR (shape->>'radiusMeters')!~'^[0-9]+$' OR (shape->>'radiusMeters')::numeric NOT BETWEEN 1 AND 100000 THEN RETURN false; END IF;
 ELSIF shape->>'type'='POLYGON' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape) k) IS DISTINCT FROM ARRAY['type','vertices']
   OR public.delivery_polygon_valid(shape->'vertices') IS DISTINCT FROM true THEN RETURN false; END IF;
 ELSE RETURN false; END IF;
 hours:=p->'activeHours'; IF jsonb_typeof(hours)<>'array' OR jsonb_array_length(hours)>28 THEN RETURN false; END IF;
 FOR i IN 0..jsonb_array_length(hours)-1 LOOP
  w:=hours->i;
  IF jsonb_typeof(w)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(w) k) IS DISTINCT FROM ARRAY['endMinute','startMinute','weekday'] THEN RETURN false; END IF;
  FOREACH v IN ARRAY ARRAY['weekday','startMinute','endMinute'] LOOP
   IF jsonb_typeof(w->v)<>'number' OR (w->>v)!~'^[0-9]+$' THEN RETURN false; END IF;
  END LOOP;
  IF (w->>'weekday')::int NOT BETWEEN 1 AND 7 OR (w->>'startMinute')::int NOT BETWEEN 0 AND 1439
   OR (w->>'endMinute')::int NOT BETWEEN 1 AND 1440 OR (w->>'startMinute')::int>=(w->>'endMinute')::int THEN RETURN false; END IF;
  FOR j IN i+1..jsonb_array_length(hours)-1 LOOP
   other:=hours->j;
   IF w->>'weekday'=other->>'weekday' AND (w->>'startMinute')::int<(other->>'endMinute')::int
    AND (other->>'startMinute')::int<(w->>'endMinute')::int THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
COMMIT;
