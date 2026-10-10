BEGIN;
-- Notifications are invalidation hints, emitted only after a successful commit.
-- Rows remain authoritative and every client subscription rechecks authorization.
CREATE FUNCTION public.notify_catalog_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE row_data jsonb; local_id text;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 local_id := CASE WHEN TG_TABLE_NAME IN ('LocationProduct','MenuSchedule') THEN row_data->>'locationId'
  WHEN TG_TABLE_NAME='Location' THEN row_data->>'id' ELSE NULL END;
 PERFORM pg_notify('pos_catalog_changed', json_build_object(
  'organizationId',row_data->>'organizationId','locationId',local_id)::text);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $triggers$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['Product','Category','LocationProduct','ModifierGroup','ModifierOption','ProductModifierGroup','MenuSchedule','Location'] LOOP
  EXECUTE format('CREATE TRIGGER catalog_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I
   FOR EACH ROW EXECUTE FUNCTION public.notify_catalog_change()',tab);
 END LOOP;
END $triggers$;
REVOKE ALL ON FUNCTION public.notify_catalog_change() FROM PUBLIC;
COMMIT;
