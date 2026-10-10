BEGIN;

-- Lock both existing tables before the preflight so concurrent catalog writes cannot
-- introduce an invalid relationship between validation and constraint installation.
LOCK TABLE public."Category",public."Product" IN ACCESS EXCLUSIVE MODE;
CREATE POLICY catalog_lifecycle_upgrade_read ON public."Category" FOR SELECT TO pos_migrator USING (true);
CREATE POLICY catalog_lifecycle_upgrade_read ON public."Product" FOR SELECT TO pos_migrator USING (true);
DO $catalog_preflight$
DECLARE invalid_count bigint;
BEGIN
 SELECT count(*) INTO invalid_count FROM public."Product" p
  JOIN public."Category" c ON c."organizationId"=p."organizationId" AND c.id=p."categoryId"
  WHERE p.status='ACTIVE' AND c.status<>'ACTIVE';
 IF invalid_count>0 THEN
  RAISE EXCEPTION 'catalog lifecycle preflight: % active products reference archived categories; explicit resolution required',invalid_count
   USING ERRCODE='23514';
 END IF;
END $catalog_preflight$;
DROP POLICY catalog_lifecycle_upgrade_read ON public."Category";
DROP POLICY catalog_lifecycle_upgrade_read ON public."Product";

ALTER TABLE public."Category"
 ADD COLUMN "sortOrder" integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT category_sort_order_range CHECK ("sortOrder" BETWEEN 0 AND 100000),
 ADD CONSTRAINT "Category_organizationId_id_status_key" UNIQUE ("organizationId",id,status);

-- MATCH SIMPLE skips the extra FK for archived products and uncategorized products.
-- The original tenant/category FK remains in place for every historical product.
-- Native referential integrity handles concurrent category archive versus product
-- create/restore at READ COMMITTED, REPEATABLE READ and SERIALIZABLE isolation.
ALTER TABLE public."Product"
 ADD COLUMN "activeCategoryStatus" text GENERATED ALWAYS AS
  (CASE WHEN status='ACTIVE' THEN 'ACTIVE'::text ELSE NULL::text END) STORED,
 ADD CONSTRAINT product_active_category_fk
  FOREIGN KEY ("organizationId","categoryId","activeCategoryStatus")
  REFERENCES public."Category"("organizationId",id,status)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

COMMIT;
