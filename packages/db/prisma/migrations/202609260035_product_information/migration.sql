BEGIN;
CREATE FUNCTION public.valid_product_information_list(items text[], maximum integer)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT cardinality(items)<=maximum
  AND (cardinality(items)=0 OR array_ndims(items)=1)
  AND NOT EXISTS (SELECT 1 FROM unnest(items) value
    WHERE value IS NULL OR value<>btrim(value) OR char_length(value) NOT BETWEEN 1 AND 100)
  AND (SELECT count(*)=count(DISTINCT lower(value)) FROM unnest(items) value)
$$;
REVOKE ALL ON FUNCTION public.valid_product_information_list(text[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_product_information_list(text[],integer) TO pos_runtime,pos_migrator;
LOCK TABLE public."Product" IN ACCESS EXCLUSIVE MODE;
CREATE POLICY product_information_upgrade_read ON public."Product" FOR SELECT TO pos_migrator USING (true);
DO $preserve_catalog$
DECLARE before_hash text; after_hash text; row_count bigint;
BEGIN
 SELECT count(*),md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY id),'empty'))
  INTO row_count,before_hash FROM public."Product" p;
 ALTER TABLE public."Product"
  ADD COLUMN calories numeric(9,3),
  ADD COLUMN protein numeric(9,3),
  ADD COLUMN fat numeric(9,3),
  ADD COLUMN carbs numeric(9,3),
  ADD COLUMN "nutritionBasis" text NOT NULL DEFAULT 'PER_PORTION',
  ADD COLUMN allergens text[] NOT NULL DEFAULT '{}',
  ADD COLUMN "allergensDeclared" boolean NOT NULL DEFAULT false,
  ADD COLUMN ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN "ingredientsDeclared" boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT product_calories_range CHECK (calories IS NULL OR calories BETWEEN 0 AND 999999.999),
  ADD CONSTRAINT product_protein_range CHECK (protein IS NULL OR protein BETWEEN 0 AND 999999.999),
  ADD CONSTRAINT product_fat_range CHECK (fat IS NULL OR fat BETWEEN 0 AND 999999.999),
  ADD CONSTRAINT product_carbs_range CHECK (carbs IS NULL OR carbs BETWEEN 0 AND 999999.999),
  ADD CONSTRAINT product_nutrition_basis CHECK ("nutritionBasis" IN ('PER_PORTION','PER_100G','PER_100ML')),
  ADD CONSTRAINT product_allergens_valid CHECK (
    public.valid_product_information_list(allergens,30) AND ("allergensDeclared" OR cardinality(allergens)=0)),
  ADD CONSTRAINT product_ingredients_valid CHECK (
    public.valid_product_information_list(ingredients,100) AND ("ingredientsDeclared" OR cardinality(ingredients)=0));
 SELECT md5(coalesce(string_agg((to_jsonb(p)-ARRAY[
  'calories','protein','fat','carbs','nutritionBasis','allergens','allergensDeclared','ingredients','ingredientsDeclared'
 ])::text,'' ORDER BY id),'empty')) INTO after_hash FROM public."Product" p;
 IF before_hash IS DISTINCT FROM after_hash THEN
  RAISE EXCEPTION 'product information migration must preserve all existing values';
 END IF;
 RAISE NOTICE 'product information: % existing product rows preserved',row_count;
END $preserve_catalog$;
DROP POLICY product_information_upgrade_read ON public."Product";
COMMIT;
