BEGIN;
CREATE OR REPLACE FUNCTION public.check_modifier_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE group_id uuid; group_row public."ModifierGroup"; available_count integer; bound boolean;
BEGIN
 IF TG_TABLE_NAME='ModifierGroup' THEN group_id := NEW.id; ELSE group_id := NEW."modifierGroupId"; END IF;
 SELECT * INTO group_row FROM public."ModifierGroup" WHERE id=group_id AND "organizationId"=NEW."organizationId";
 SELECT count(*) INTO available_count FROM public."ModifierOption" WHERE "organizationId"=NEW."organizationId" AND "modifierGroupId"=group_id AND status='ACTIVE';
 SELECT EXISTS(SELECT 1 FROM public."ProductModifierGroup" WHERE "organizationId"=NEW."organizationId" AND "modifierGroupId"=group_id AND status='ACTIVE') INTO bound;
 IF available_count>20 OR (bound AND (group_row.status<>'ACTIVE' OR available_count<group_row."minSelections")) THEN
  RAISE EXCEPTION 'active modifier bindings must remain satisfiable with at most twenty options' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='ProductModifierGroup' THEN
  IF (SELECT count(*) FROM public."ProductModifierGroup" WHERE "organizationId"=NEW."organizationId"
   AND "productId"=NEW."productId" AND status='ACTIVE')>10 THEN
   RAISE EXCEPTION 'product permits at most ten active modifier groups' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
COMMIT;
