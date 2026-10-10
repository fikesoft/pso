BEGIN;

ALTER TABLE public."Organization" ADD COLUMN locale text NOT NULL DEFAULT 'ro-MD';
ALTER TABLE public."Organization" ADD CONSTRAINT organization_locale_check
  CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$');

CREATE TABLE public."Brand" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL REFERENCES public."Organization"(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{2,30}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId",code)
);
ALTER TABLE public."Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Brand" FORCE ROW LEVEL SECURITY;
CREATE POLICY brand_tenant ON public."Brand" TO pos_runtime
  USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON public."Brand" FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE ON public."Brand" TO pos_runtime;

ALTER TABLE public."Location"
  ADD COLUMN "brandId" uuid,
  ADD COLUMN phone text,
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD COLUMN "businessHours" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT location_brand_fk FOREIGN KEY ("organizationId","brandId")
    REFERENCES public."Brand"("organizationId",id) ON DELETE RESTRICT,
  ADD CONSTRAINT location_phone_check CHECK (phone IS NULL OR length(phone) BETWEEN 3 AND 40),
  ADD CONSTRAINT location_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT location_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
CREATE INDEX location_brand_idx ON public."Location"("organizationId","brandId") WHERE "brandId" IS NOT NULL;

CREATE FUNCTION public.valid_business_hours(hours jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE entry jsonb; day_value int; seen_days int[] := '{}'; opening text; closing text;
BEGIN
  IF jsonb_typeof(hours) <> 'array' OR jsonb_array_length(hours) > 7 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(hours) LOOP
    IF jsonb_typeof(entry) <> 'object' OR
      (SELECT count(*) FROM jsonb_object_keys(entry)) <> 3 OR
      NOT (entry ?& ARRAY['day','opensAt','closesAt']) OR
      jsonb_typeof(entry->'day') <> 'number' OR
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
REVOKE ALL ON FUNCTION public.valid_business_hours(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_business_hours(jsonb) TO pos_runtime;
ALTER TABLE public."Location" ADD CONSTRAINT location_business_hours_check
  CHECK (public.valid_business_hours("businessHours"));

CREATE FUNCTION public.check_location_brand() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE brand_status text;
BEGIN
  IF NEW."brandId" IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO brand_status FROM public."Brand"
    WHERE id=NEW."brandId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
  IF brand_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'location requires active brand in same organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER location_brand_guard BEFORE INSERT OR UPDATE OF "brandId", status ON public."Location"
  FOR EACH ROW EXECUTE FUNCTION public.check_location_brand();

CREATE FUNCTION public.check_brand_disable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status='DISABLED' AND EXISTS (
    SELECT 1 FROM public."Location" WHERE "organizationId"=NEW."organizationId"
      AND "brandId"=NEW.id AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'active locations use brand' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER brand_disable_guard BEFORE UPDATE OF status ON public."Brand"
  FOR EACH ROW EXECUTE FUNCTION public.check_brand_disable();

COMMIT;
