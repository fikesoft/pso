BEGIN;
CREATE TABLE "BillPlanCommandGate" (
 "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('CREATE','VOID')),
 "requestKey" uuid NOT NULL, revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 PRIMARY KEY ("organizationId","locationId",kind,"requestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id)
);
CREATE TABLE "BillPlanRetirement" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('CREATE','VOID')), "requestKey" uuid NOT NULL, "actorUserId" uuid NOT NULL,
 "targetOrderId" uuid, "targetVisitId" uuid, "targetSplitId" uuid,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind='CREATE' AND "targetSplitId" IS NULL AND num_nonnulls("targetOrderId","targetVisitId")=1)
  OR (kind='VOID' AND "targetSplitId" IS NOT NULL AND "targetOrderId" IS NULL AND "targetVisitId" IS NULL)),
 UNIQUE ("organizationId","locationId",kind,"requestKey"),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","targetOrderId") REFERENCES "Order"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","targetVisitId") REFERENCES "TableVisit"("organizationId","locationId",id),
 FOREIGN KEY ("organizationId","locationId","targetSplitId") REFERENCES "BillSplit"("organizationId","locationId",id)
);
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['BillPlanCommandGate','BillPlanRetirement'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',rel);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',rel);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',rel);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',rel);
 END LOOP;
END $$;
GRANT UPDATE(revision) ON "BillPlanCommandGate" TO pos_runtime;
CREATE TRIGGER bill_plan_gate_guard BEFORE INSERT OR UPDATE OR DELETE ON "BillPlanCommandGate" FOR EACH ROW EXECUTE FUNCTION public.protect_table_gate();
CREATE TRIGGER bill_plan_retirement_immutable BEFORE UPDATE OR DELETE ON "BillPlanRetirement" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.prepare_bill_plan_command(org uuid,loc uuid,family text,key uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public."BillPlanCommandGate"("organizationId","locationId",kind,"requestKey") VALUES(org,loc,family,key)
 ON CONFLICT ("organizationId","locationId",kind,"requestKey") DO UPDATE SET revision="BillPlanCommandGate".revision+1;
END $$;
CREATE FUNCTION public.guard_bill_plan_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE family text;
BEGIN
 family:=CASE WHEN TG_TABLE_NAME='BillSplit' THEN 'CREATE' WHEN TG_TABLE_NAME='BillSplitVoid' THEN 'VOID' ELSE to_jsonb(NEW)->>'kind' END;
 PERFORM public.prepare_bill_plan_command(NEW."organizationId",NEW."locationId",family,NEW."requestKey");
 IF TG_TABLE_NAME='BillPlanRetirement' THEN
  IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
   RAISE EXCEPTION 'bill retirement requires current scoped actor' USING ERRCODE='23514'; END IF;
  IF (family='CREATE' AND EXISTS (SELECT 1 FROM public."BillSplit" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey"))
   OR (family='VOID' AND EXISTS (SELECT 1 FROM public."BillSplitVoid" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND "requestKey"=NEW."requestKey")) THEN
   RAISE EXCEPTION 'successful bill command cannot be retired' USING ERRCODE='23514'; END IF;
  NEW."createdAt":=statement_timestamp();
 ELSIF EXISTS (SELECT 1 FROM public."BillPlanRetirement" WHERE "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" AND kind=family AND "requestKey"=NEW."requestKey") THEN
  RAISE EXCEPTION 'bill plan command retired' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_bill_plan_command BEFORE INSERT ON "BillSplit" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_plan_command();
CREATE TRIGGER a_bill_plan_command BEFORE INSERT ON "BillSplitVoid" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_plan_command();
CREATE TRIGGER bill_plan_retirement_guard BEFORE INSERT ON "BillPlanRetirement" FOR EACH ROW EXECUTE FUNCTION public.guard_bill_plan_command();
REVOKE ALL ON FUNCTION public.prepare_bill_plan_command(uuid,uuid,text,uuid),public.guard_bill_plan_command() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_bill_plan_command(uuid,uuid,text,uuid) TO pos_runtime;
COMMIT;
