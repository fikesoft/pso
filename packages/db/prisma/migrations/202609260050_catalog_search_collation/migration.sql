BEGIN;
-- Search must not silently fall back to the database C locale (ASCII case handling).
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collprovider='i') THEN
  RAISE EXCEPTION 'Catalog search requires a PostgreSQL build with ICU support';
 END IF;
END $$;
CREATE COLLATION public.pos_catalog_search (provider=icu, locale='und', deterministic=true);
COMMENT ON COLLATION public.pos_catalog_search IS
 'Deterministic ICU Unicode case handling for literal catalog ILIKE; accent-sensitive. Requires PostgreSQL ICU support.';
-- No product snapshots or data are rewritten and no unmeasured search index is introduced.
COMMIT;
