BEGIN;
CREATE OR REPLACE FUNCTION public.valid_business_hours(hours jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE entry jsonb; day_value int; seen_days int[] := '{}'; opening text; closing text;
BEGIN
  IF jsonb_typeof(hours) <> 'array' OR jsonb_array_length(hours) > 7 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(hours) LOOP
    IF jsonb_typeof(entry) <> 'object' OR
      (SELECT count(*) FROM jsonb_object_keys(entry)) <> 3 OR
      NOT (entry ?& ARRAY['day','opensAt','closesAt']) OR
      jsonb_typeof(entry->'day') <> 'number' OR
      jsonb_typeof(entry->'opensAt') <> 'string' OR
      jsonb_typeof(entry->'closesAt') <> 'string' OR
      (entry->>'day') !~ '^[0-6]$' THEN RETURN false; END IF;
    day_value := (entry->>'day')::int;
    IF day_value = ANY(seen_days) THEN RETURN false; END IF;
    seen_days := array_append(seen_days,day_value);
    opening := entry->>'opensAt'; closing := entry->>'closesAt';
    IF opening !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       closing !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       opening = closing THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
COMMIT;
