BEGIN;
-- Retirement must remain possible when another operation already merged the original source.
-- It locks only the current root; the unique command key arbitrates any concurrent successful merge.
CREATE OR REPLACE FUNCTION public.validate_table_visit_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'visit command requires the current scoped actor' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='MOVED' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."targetTableId");
 END IF;
 IF NEW.kind='OPEN' THEN
  PERFORM public.prepare_dining_table(NEW."organizationId",NEW."locationId",NEW."tableId");
 ELSE
  PERFORM public.prepare_table_visit(NEW."organizationId",NEW."locationId",NEW."visitId");
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
COMMIT;
